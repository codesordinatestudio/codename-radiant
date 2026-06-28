import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { URI } from 'vscode-uri';

import { RadiantLexer } from '../parser/lexer';
import { parserInstance } from '../parser/parser';
import { visitorInstance } from '../parser/visitor';
import { compile, SemanticError } from '../compiler';
import { formatRadiant } from './formatter';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true,
      
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '\n']
      }
    }
  };
});

let workspaceRoot: string | null = null;
connection.onInitialize((params: InitializeParams) => {
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceRoot = URI.parse(params.workspaceFolders[0].uri).fsPath;
  }
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentFormattingProvider: true,
      
      
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '\n']
      }
    }
  };
});

function findRadiantFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findRadiantFiles(filePath));
      } else if (filePath.endsWith('.radiant')) {
        results.push(filePath);
      }
    }
  } catch (err) { }
  return results;
}

documents.onDidChangeContent(change => {
  // When ANY open file changes, re-validate ALL open files 
  // so that cross-file squiggly lines update instantly everywhere.
  documents.all().forEach(doc => {
    validateTextDocument(doc);
  });
});

documents.onDidClose(e => {
  // Clear diagnostics for the closed file
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  // Re-validate remaining files in case a conflict was resolved by closing/deleting this file
  documents.all().forEach(doc => {
    validateTextDocument(doc);
  });
});

function validateTextDocument(textDocument: TextDocument): void {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  // 1. Lexing
  const lexResult = RadiantLexer.tokenize(text);
  
  for (const err of lexResult.errors) {
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(err.offset),
        end: textDocument.positionAt(err.offset + err.length)
      },
      message: err.message,
      source: 'radiant'
    };
    diagnostics.push(diagnostic);
  }

  // 2. Parsing (only if lexer didn't catastrophically fail)
  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.radiantFile();

  let hasParseErrors = false;
  for (const err of parserInstance.errors) {
    hasParseErrors = true;
    const token = err.token;
    let startOffset = 0;
    let endOffset = 1;
    
    if (token && !isNaN(token.startOffset)) {
      startOffset = token.startOffset;
      endOffset = token.endOffset !== undefined ? token.endOffset + 1 : startOffset + 1;
    }

    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(startOffset),
        end: textDocument.positionAt(endOffset)
      },
      message: err.message,
      source: 'radiant'
    });
  }

  // 3. Semantic Validation (only if it parsed successfully enough)
  if (!hasParseErrors) {
    const rawAsts: any[] = [];
    
    const workspaceAsts: any[] = [];
    
    // Scan other files in workspace to get cross-file context FIRST
    if (workspaceRoot) {
      const allFiles = findRadiantFiles(workspaceRoot); // fallback to scanning entire root to find everything
      
      for (const file of allFiles) {
        // skip the file currently open in editor (we already have its AST from memory)
        const fileUri = URI.file(file).toString();
        if (fileUri === textDocument.uri) continue;
        
        try {
          let text: string;
          const openDoc = documents.get(fileUri);
          if (openDoc) {
             text = openDoc.getText();
          } else {
             text = readFileSync(file, 'utf-8');
          }
          
          const lex = RadiantLexer.tokenize(text);
          if (lex.errors.length > 0) continue;
          
          parserInstance.input = lex.tokens;
          const fileCst = parserInstance.radiantFile();
          if (parserInstance.errors.length > 0) continue;
          
          const fileAst = visitorInstance.visit(fileCst);
          fileAst.uri = fileUri;
          workspaceAsts.push(fileAst);
        } catch (e) {
          // Ignore files that are broken on disk
        }
      }
    }

    rawAsts.push(...workspaceAsts);

    // Push the currently edited AST LAST so its duplicates conflict with the workspace!
    const activeAst = visitorInstance.visit(cst);
    activeAst.uri = textDocument.uri;
    rawAsts.push(activeAst);

    try {
      const { errors } = compile(rawAsts);
      
      for (const err of errors) {
        const token = err.token;
        if (token) {
           // Only show semantic errors for the CURRENT file in the editor
           if (err.uri === textDocument.uri) {
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: textDocument.positionAt(token.startOffset),
                  end: textDocument.positionAt((token.endOffset || token.startOffset) + 1)
                },
                message: err.message,
                source: 'radiant'
              });
           }
        }
      }
    } catch (e) {
      // Catch fatal compiler crashes
    }
  }

  // Send the computed diagnostics to VS Code.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion((_textDocumentPosition) => {
  return [
    {
      label: 'apiPrefix',
      kind: 14,
      detail: 'Set the global API prefix (e.g. "/api")',
      documentation: 'Allowed in config {}'
    },
    {
      label: 'auth',
      kind: 14,
      detail: 'Enable authentication',
      documentation: 'Allowed in collection {} or security {}'
    },
    {
      label: 'fields',
      kind: 14,
      detail: 'Define database schema fields',
      documentation: 'Allowed in collection {}'
    },
    {
      label: 'strategies',
      kind: 14,
      detail: 'Set authentication strategies (e.g. ["jwt"])',
      documentation: 'Allowed in auth {}'
    }
  ];
});

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const formattedText = formatRadiant(document.getText());
  return [
    {
      range: {
        start: document.positionAt(0),
        end: document.positionAt(document.getText().length)
      },
      newText: formattedText
    }
  ];
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

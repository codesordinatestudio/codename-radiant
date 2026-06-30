import type { CstNode, IToken } from 'chevrotain';
import { RadiantLexer } from '../parser/lexer';
import { parserInstance } from '../parser/parser';

const INDENT = '  '; // 2-space indent

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Formats a `.radiant` file by lexing → parsing → walking the CST.
 *
 * This is structurally correct: it formats based on the parser's understanding
 * of the grammar, so string literals, comments, and nested structures are all
 * handled properly. No regex heuristics on raw text.
 *
 * Returns the original text unchanged if the input has lex/parse errors
 * (we never format broken code).
 */
export function formatRadiant(text: string): string {
  // 1. Lex — get the full token stream including grouped comments
  const lexResult = RadiantLexer.tokenize(text);
  if (lexResult.errors.length > 0) return text;

  // 2. Collect comments from the grouped token stream
  const comments: IToken[] = (lexResult.groups as Record<string, IToken[]>)['comments'] || [];

  // 3. Parse — get the CST
  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.radiantFile();
  if (parserInstance.errors.length > 0) return text;

  // 4. Walk the CST and emit formatted output
  const ctx = new FormatContext(comments);
  emitRadiantFile(cst, ctx);

  return ctx.finish();
}

// ─── Format Context ─────────────────────────────────────────────────────────

/**
 * Accumulates the formatted output and tracks indentation + comment emission.
 */
class FormatContext {
  private output: string[] = [];
  private depth = 0;
  private comments: IToken[];
  private commentIndex = 0;

  constructor(comments: IToken[]) {
    // Sort comments by start offset so we can emit them in order
    this.comments = comments.slice().sort((a, b) => a.startOffset - b.startOffset);
  }

  indent(): string {
    return INDENT.repeat(this.depth);
  }

  push(): void {
    this.depth++;
  }

  pop(): void {
    this.depth = Math.max(0, this.depth - 1);
  }

  /** Write a full line at the current indentation level. */
  writeLine(line: string): void {
    this.output.push(this.indent() + line);
  }

  /** Write an empty line (blank separator). */
  writeBlank(): void {
    this.output.push('');
  }

  /**
   * Emit any comments whose startOffset is before `beforeOffset`.
   * This attaches leading comments to the next structural node.
   */
  emitCommentsBefore(beforeOffset: number): void {
    while (
      this.commentIndex < this.comments.length &&
      this.comments[this.commentIndex]!.startOffset < beforeOffset
    ) {
      const comment = this.comments[this.commentIndex]!;
      this.writeLine(comment.image);
      this.commentIndex++;
    }
  }

  /** Emit any remaining trailing comments at the end of the file. */
  emitTrailingComments(): void {
    while (this.commentIndex < this.comments.length) {
      const comment = this.comments[this.commentIndex]!;
      this.writeLine(comment.image);
      this.commentIndex++;
    }
  }

  /** Produce the final formatted string. */
  finish(): string {
    // Ensure exactly one trailing newline
    const result = this.output.join('\n');
    return result.endsWith('\n') ? result : result + '\n';
  }
}

// ─── CST Node Helpers ───────────────────────────────────────────────────────

/** Safely get a child array from a CST node. */
function children(node: CstNode, name: string): any[] {
  return (node.children as Record<string, any[]>)?.[name] || [];
}

/** Get the first token from a child key. */
function firstToken(node: CstNode, name: string): IToken | undefined {
  const arr = children(node, name);
  return arr.length > 0 ? arr[0] : undefined;
}

/** Get the first child CST node from a child key. */
function firstChild(node: CstNode, name: string): CstNode | undefined {
  const arr = children(node, name);
  return arr.length > 0 ? arr[0] : undefined;
}

/**
 * Get the earliest startOffset of any token in a CST subtree.
 * Used to position comments relative to nodes.
 */
function nodeStartOffset(node: CstNode): number {
  let min = Infinity;
  for (const key of Object.keys(node.children)) {
    for (const child of (node.children as Record<string, any[]>)[key] || []) {
      if ('startOffset' in child && typeof child.startOffset === 'number') {
        min = Math.min(min, child.startOffset);
      } else if ('children' in child) {
        min = Math.min(min, nodeStartOffset(child as CstNode));
      }
    }
  }
  return min;
}

// ─── CST Emitters ───────────────────────────────────────────────────────────

function emitRadiantFile(cst: CstNode, ctx: FormatContext): void {
  // Gather all top-level blocks in their original source order
  const blocks: CstNode[] = [
    ...children(cst, 'configBlock'),
    ...children(cst, 'collectionBlock'),
    ...children(cst, 'globalBlock'),
  ].sort((a, b) => nodeStartOffset(a) - nodeStartOffset(b));

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;

    if (i > 0) ctx.writeBlank();

    ctx.emitCommentsBefore(nodeStartOffset(block));

    const name = (block as any).name;
    if (name === 'configBlock') {
      emitConfigBlock(block, ctx);
    } else if (name === 'collectionBlock') {
      emitCollectionBlock(block, ctx);
    } else if (name === 'globalBlock') {
      emitGlobalBlock(block, ctx);
    }
  }

  ctx.emitTrailingComments();
}

function emitConfigBlock(node: CstNode, ctx: FormatContext): void {
  ctx.writeLine('config {');
  ctx.push();
  emitObjectBody(firstChild(node, 'objectBody')!, ctx);
  ctx.pop();
  ctx.writeLine('}');
}

function emitCollectionBlock(node: CstNode, ctx: FormatContext): void {
  const nameToken = firstToken(node, 'Identifier');
  ctx.writeLine(`collection ${nameToken!.image} {`);
  ctx.push();
  emitObjectBody(firstChild(node, 'objectBody')!, ctx);
  ctx.pop();
  ctx.writeLine('}');
}

function emitGlobalBlock(node: CstNode, ctx: FormatContext): void {
  const nameToken = firstToken(node, 'Identifier') || firstToken(node, 'Global');
  // The Global token itself may match 'global' or 'globals'
  const globalKeyword = firstToken(node, 'Global');
  ctx.writeLine(`global ${nameToken!.image} {`);
  ctx.push();
  emitObjectBody(firstChild(node, 'objectBody')!, ctx);
  ctx.pop();
  ctx.writeLine('}');
}

function emitObjectBody(node: CstNode, ctx: FormatContext): void {
  const properties = children(node, 'property');
  for (const prop of properties) {
    ctx.emitCommentsBefore(nodeStartOffset(prop));
    emitProperty(prop, ctx);
  }
}

function emitProperty(node: CstNode, ctx: FormatContext): void {
  // Property name
  const propNameNode = firstChild(node, 'propertyName')!;
  const nameToken = getPropertyNameToken(propNameNode);
  const name = nameToken.image;

  // Value
  const valueNode = firstChild(node, 'value')!;
  const valueStr = emitValue(valueNode, ctx);

  // Array suffix []
  const hasArray = children(node, 'LSquare').length > 0;
  const arraySuffix = hasArray ? '[]' : '';

  // Decorators
  const decorators = children(node, 'decorator');
  const decoratorStr = decorators.map((d: CstNode) => ' ' + emitDecorator(d)).join('');

  // Determine if the value is an inline object — if so we emit multi-line
  if (isObjectValue(valueNode)) {
    // Multi-line object: `name: {\n  ...\n}`
    ctx.writeLine(`${name}: {`);
    ctx.push();
    const objNode = firstChild(valueNode, 'objectLiteral')!;
    emitObjectBody(firstChild(objNode, 'objectBody')!, ctx);
    ctx.pop();
    ctx.writeLine('}');
  } else {
    // Single-line property
    const semicolonOrComma = children(node, 'SemiColon').length > 0 ? ';' : '';
    ctx.writeLine(`${name}: ${valueStr}${arraySuffix}${decoratorStr}${semicolonOrComma}`);
  }
}

function getPropertyNameToken(node: CstNode): IToken {
  for (const key of ['Identifier', 'Config', 'Collection', 'Global', 'Fields']) {
    const tok = firstToken(node, key);
    if (tok) return tok;
  }
  // Fallback — shouldn't happen with a valid CST
  return { image: '??', startOffset: 0 } as IToken;
}

// ─── Value Emitters (return strings, no newlines) ───────────────────────────

function emitValue(node: CstNode, ctx: FormatContext): string {
  const str = firstToken(node, 'StringLiteral');
  if (str) return str.image;

  const num = firstToken(node, 'NumberLiteral');
  if (num) return num.image;

  const trueToken = firstToken(node, 'True');
  if (trueToken) return 'true';

  const falseToken = firstToken(node, 'False');
  if (falseToken) return 'false';

  const funcOrId = firstChild(node, 'functionOrIdentifier');
  if (funcOrId) return emitFunctionOrIdentifier(funcOrId, ctx);

  const arrLit = firstChild(node, 'arrayLiteral');
  if (arrLit) return emitArrayLiteral(arrLit, ctx);

  const objLit = firstChild(node, 'objectLiteral');
  if (objLit) return emitObjectLiteralInline(objLit, ctx);

  return '';
}

function isObjectValue(node: CstNode): boolean {
  return children(node, 'objectLiteral').length > 0;
}

function emitFunctionOrIdentifier(node: CstNode, ctx: FormatContext): string {
  const nameToken = firstToken(node, 'Identifier')!;
  const hasParens = children(node, 'LParen').length > 0;

  if (!hasParens) return nameToken.image;

  const args = children(node, 'value');
  const argStrs = args.map((v: CstNode) => emitValue(v, ctx));
  return `${nameToken.image}(${argStrs.join(', ')})`;
}

function emitArrayLiteral(node: CstNode, ctx: FormatContext): string {
  const values = children(node, 'value');
  if (values.length === 0) return '[]';
  const items = values.map((v: CstNode) => emitValue(v, ctx));
  return `[${items.join(', ')}]`;
}

/** Emit an object literal as a single-line `{ ... }` for simple inline usage. */
function emitObjectLiteralInline(node: CstNode, ctx: FormatContext): string {
  // For the multi-line case, the caller (emitProperty) handles it directly.
  // This is only used when the object appears in a non-property context
  // (e.g., inside an array literal).
  const bodyNode = firstChild(node, 'objectBody');
  if (!bodyNode) return '{}';
  const props = children(bodyNode, 'property');
  if (props.length === 0) return '{}';

  const parts = props.map((p: CstNode) => {
    const pName = getPropertyNameToken(firstChild(p, 'propertyName')!);
    const pVal = emitValue(firstChild(p, 'value')!, ctx);
    return `${pName.image}: ${pVal}`;
  });
  return `{ ${parts.join(', ')} }`;
}

// ─── Decorator Emitter ──────────────────────────────────────────────────────

function emitDecorator(node: CstNode): string {
  const decoratorToken = firstToken(node, 'Decorator')!;
  const hasParens = children(node, 'LParen').length > 0;

  if (!hasParens) return decoratorToken.image;

  const args = children(node, 'value');
  const argStrs = args.map((v: CstNode) => emitValue(v, {} as FormatContext));
  return `${decoratorToken.image}(${argStrs.join(', ')})`;
}

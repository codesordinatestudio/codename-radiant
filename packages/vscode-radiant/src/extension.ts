import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in the cli package.
  // We'll point this to the compiled CLI binary, but for development we can point it to the bun script.
  // Assuming the user runs this extension in the root of the workspace.
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for radiant documents
    documentSelector: [{ scheme: "file", language: "radiant" }],
    synchronize: {
      // Notify the server about file changes to '.radiant' files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/*.radiant"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient("radiantLanguageServer", "Radiant Language Server", serverOptions, clientOptions);

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

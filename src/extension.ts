import * as vscode from "vscode";
import * as path from "path";
import { EmbeddingsService } from "./services/embeddingsService";
import { CommandService } from "./services/commandService";
import { ProviderService } from "./providers/providerService";
import { parseDocument, parseAllNotesFolder } from "./parser";
import { updateDecorations } from "./decorations";

let embeddingsService: EmbeddingsService;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize services
  embeddingsService = new EmbeddingsService({
    serverDir: path.join(context.extensionPath, "embeddings-server"),
    serverScript: path.join(context.extensionPath, "embeddings-server", "server.py"),
    maxStartupTime: 240000, // 240 seconds (!!!)
    pythonCommands: ["python3", "python", "py"],
  });

  const commandService = new CommandService(context, embeddingsService);
  const providerService = new ProviderService(context);

  // Start embeddings server asynchronously
  startEmbeddingsServerAsync(embeddingsService, context);

  // Register all services
  commandService.registerCommands();
  providerService.registerProviders();

  // Register event listeners
  registerEventListeners(context);

  // Initial setup
  initializeExtension();
}

async function startEmbeddingsServerAsync(
  service: EmbeddingsService,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    await service.start();
    vscode.window.showInformationMessage(
      "Embeddings server started successfully"
    );
  } catch (error: any) {
    console.error("Embeddings server startup failed:", error);
    vscode.window.showErrorMessage(
      `Failed to start embeddings server: ${error.message}. Run 'Kernel: Setup Embeddings' to install dependencies.`
    );
  }

  // Register cleanup
  context.subscriptions.push({
    dispose: () => service.stop(),
  });
}

function registerEventListeners(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "kernel-mdx") {
        parseDocument(event.document);
      }
    }),

    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "kernel-mdx") {
        parseDocument(document);
      }
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    })
  );
}

function initializeExtension(): void {
  // Parse all open documents
  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.languageId === "kernel-mdx") {
      parseDocument(doc);
    }
  });

  // Update decorations for active editor
  updateDecorations();

  // Parse all notes in the background
  parseAllNotesFolder().catch((error) => {
    console.error("Failed to parse notes folder:", error);
  });
}

export function deactivate() {
  if (embeddingsService) {
    embeddingsService.stop();
  }
}

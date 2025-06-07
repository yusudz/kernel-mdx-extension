import * as vscode from "vscode";
import * as path from "path";
import { EmbeddingsService } from "./services/embeddingsService";
import { CommandService } from "./services/commandService";
import { ProviderService } from "./providers/providerService";
import { documentParser } from "./parser";
import { updateDecorations } from "./decorations";
import { eventBus } from "./events/eventBus";
import { LANGUAGE_ID, DEFAULT_CONFIG } from "./constants";

export class KernelExtension {
  private embeddingsService!: EmbeddingsService;
  private commandService!: CommandService;
  private providerService!: ProviderService;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  async activate(): Promise<void> {
    // Initialize services
    this.initializeServices();
    
    // Start embeddings server asynchronously
    this.startEmbeddingsServerAsync();

    // Register all components
    this.registerServices();
    this.registerEventListeners();
    this.setupEventBusListeners();

    // Initial setup
    await this.initializeExtension();
  }

  deactivate(): void {
    this.embeddingsService?.stop();
    eventBus.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  private initializeServices(): void {
    this.embeddingsService = new EmbeddingsService({
      serverDir: path.join(this.context.extensionPath, "embeddings-server"),
      serverScript: path.join(this.context.extensionPath, "embeddings-server", "server.py"),
      maxStartupTime: DEFAULT_CONFIG.EMBEDDINGS_STARTUP_TIMEOUT,
      pythonCommands: ["python3", "python", "py"],
    });

    this.commandService = new CommandService(this.context, this.embeddingsService);
    this.providerService = new ProviderService(this.context);
  }

  private registerServices(): void {
    this.commandService.registerCommands();
    this.providerService.registerProviders();
  }

  private async startEmbeddingsServerAsync(): Promise<void> {
    try {
      await this.embeddingsService.start();
      eventBus.emit('embeddings:started', undefined);
      vscode.window.showInformationMessage(
        "Embeddings server started successfully"
      );
    } catch (error: any) {
      eventBus.emit('embeddings:error', { error });
      console.error("Embeddings server startup failed:", error);
      vscode.window.showErrorMessage(
        `Failed to start embeddings server: ${error.message}. Run 'Kernel: Setup Embeddings' to install dependencies.`
      );
    }
  }

  private registerEventListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === LANGUAGE_ID) {
          documentParser.parseDocument(event.document);
        }
      }),

      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === LANGUAGE_ID) {
          documentParser.parseDocument(document);
        }
      }),

      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          updateDecorations(editor);
        }
      })
    );
  }

  private setupEventBusListeners(): void {
    this.disposables.push(
      eventBus.on('blocks:cleared', () => {
        updateDecorations();
      }),

      eventBus.on('block:added', () => {
        updateDecorations();
      }),

      eventBus.on('block:updated', () => {
        updateDecorations();
      }),

      eventBus.on('block:removed', () => {
        updateDecorations();
      })
    );
  }

  private async initializeExtension(): Promise<void> {
    // Parse all open documents
    vscode.workspace.textDocuments.forEach((doc) => {
      if (doc.languageId === LANGUAGE_ID) {
        documentParser.parseDocument(doc);
      }
    });

    // Update decorations for active editor
    updateDecorations();

    // Parse all notes in the background
    documentParser.parseAllNotesFolder().catch((error) => {
      console.error("Failed to parse notes folder:", error);
    });
  }
}

let extension: KernelExtension;

export async function activate(context: vscode.ExtensionContext) {
  extension = new KernelExtension(context);
  await extension.activate();
}

export function deactivate() {
  extension?.deactivate();
}

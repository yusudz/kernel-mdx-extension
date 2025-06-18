import * as vscode from "vscode";
import { EmbeddingsService } from "./embeddingsService";
import { ContextService } from "./contextService";
import { blockManager } from "../blockManager";
import { updateDecorations } from "../decorations";
import { documentParser } from "../parser";
import { searchBlocksCommand } from "../commands/searchBlocks";
import { openChatCommand } from "../commands/chat";
import { COMMANDS, DEFAULT_CONFIG, LANGUAGE_ID } from "../constants";
import * as path from "path";
import { ClaudeService } from "./claudeService";
import { MobileServer } from "./mobileServer";

export class CommandService {
  private contextService: ContextService;
  private mobileServer?: MobileServer;

  constructor(
    private context: vscode.ExtensionContext,
    private embeddingsService: EmbeddingsService
  ) {
    this.contextService = new ContextService(embeddingsService);
  }

  registerCommands(): void {
    const commands = [
      {
        id: COMMANDS.SEARCH_BLOCKS,
        handler: () => searchBlocksCommand(this.embeddingsService),
      },
      {
        id: COMMANDS.SETUP_EMBEDDINGS,
        handler: this.setupEmbeddings.bind(this),
      },
      {
        id: COMMANDS.FLUSH_BLOCKS,
        handler: this.flushBlocks.bind(this),
      },
      {
        id: COMMANDS.OPEN_CHAT,
        handler: () => openChatCommand(this.embeddingsService),
      },
      {
        id: COMMANDS.PARSE_ALL_NOTES,
        handler: documentParser.parseAllNotesFolder.bind(documentParser),
      },
      {
        id: COMMANDS.COPY_CONTEXT,
        handler: this.copyContext.bind(this),
      },
      {
        id: COMMANDS.ADD_BLOCK_ID,
        handler: this.addBlockId.bind(this),
      },
      {
        id: 'kernel-mdx.startMobileServer',
        handler: this.startMobileServer.bind(this),
      },
      {
        id: 'kernel-mdx.stopMobileServer',
        handler: this.stopMobileServer.bind(this),
      },
    ];

    commands.forEach(({ id, handler }) => {
      this.context.subscriptions.push(
        vscode.commands.registerCommand(id, handler)
      );
    });
  }

  private async setupEmbeddings(): Promise<void> {
    const serverDir = path.join(this.context.extensionPath, "embeddings-server");
    const terminal = vscode.window.createTerminal({
      name: "Kernel Embeddings Setup",
      cwd: serverDir,
    });
    terminal.show();
    terminal.sendText("pip install -r requirements.txt");
  }

  private async flushBlocks(): Promise<void> {
    blockManager.clear();
    let docCount = 0;
    vscode.workspace.textDocuments.forEach((doc) => {
      if (doc.languageId === LANGUAGE_ID) {
        documentParser.parseDocument(doc);
        docCount++;
      }
    });
    updateDecorations();
    vscode.window.showInformationMessage(
      `Flushed block cache. Re-parsed ${docCount} document(s), found ${blockManager.size} block(s).`
    );
  }

  private async copyContext(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const context = await this.contextService.gatherContext({ editor });
    await vscode.env.clipboard.writeText(context);
    vscode.window.showInformationMessage(
      `Copied ${context.length} characters of context to clipboard`
    );
  }

  private addBlockId(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const position = editor.selection.active;
    const document = editor.document;
    const blockBoundary = this.findBlockBoundary(document, position);

    if (blockBoundary) {
      const id = blockManager.generateId();
      const endOfLine = document.lineAt(blockBoundary.endLine).range.end;
      editor.edit((editBuilder) => {
        editBuilder.insert(endOfLine, ` @${id}`);
      });
    }
  }

  private findBlockBoundary(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { startLine: number; endLine: number } | null {
    let bracketCount = 0;
    let foundStart = false;
    let startLine = -1;

    // Find opening bracket
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text;
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === "]") bracketCount++;
        if (line[j] === "[") {
          bracketCount--;
          if (bracketCount < 0) {
            foundStart = true;
            startLine = i;
            break;
          }
        }
      }
      if (foundStart) break;
    }

    if (!foundStart) return null;

    // Find closing bracket
    bracketCount = 1;
    for (let i = position.line; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      for (let j = 0; j < line.length; j++) {
        if (line[j] === "[") bracketCount++;
        if (line[j] === "]") {
          bracketCount--;
          if (bracketCount === 0) {
            return { startLine, endLine: i };
          }
        }
      }
    }

    return null;
  }

  private async startMobileServer(): Promise<void> {
    if (this.mobileServer) {
      vscode.window.showInformationMessage('Mobile server is already running');
      return;
    }
  
    // Get AI service configuration
    const config = vscode.workspace.getConfiguration('kernel');
    const apiKey = config.get<string>('claudeApiKey', '');
    
    const aiService = new ClaudeService({
      apiKey,
      model: config.get<string>('claudeModel', DEFAULT_CONFIG.CLAUDE_MODEL),
    });
  
    this.mobileServer = new MobileServer(
      aiService,
      this.contextService,
      3000
    );
  
    const url = await this.mobileServer.start();
    
    // Show notification with QR code option
    const result = await vscode.window.showInformationMessage(
      `Mobile server started at ${url}`,
      'Copy URL',
      'Show QR Code'
    );
  
    if (result === 'Copy URL') {
      await vscode.env.clipboard.writeText(url);
    } else if (result === 'Show QR Code') {
      // Could open a webview with QR code
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      await vscode.env.openExternal(vscode.Uri.parse(qrUrl));
    }
  }
  
  private stopMobileServer(): void {
    if (this.mobileServer) {
      this.mobileServer.stop();
      this.mobileServer = undefined;
      vscode.window.showInformationMessage('Mobile server stopped');
    }
  }
}
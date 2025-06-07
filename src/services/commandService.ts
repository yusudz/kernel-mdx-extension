import * as vscode from "vscode";
import { EmbeddingsService } from "./embeddingsService";
import { ContextService } from "./contextService";
import { blockManager } from "../blockManager";
import { updateDecorations } from "../decorations";
import { documentParser } from "../parser";
import { searchBlocksCommand } from "../commands/searchBlocks";
import { openChatCommand } from "../commands/chat";
import { COMMANDS, LANGUAGE_ID } from "../constants";
import * as path from "path";

export class CommandService {
  private contextService: ContextService;

  constructor(
    private context: vscode.ExtensionContext,
    private embeddingsService: EmbeddingsService
  ) {
    this.contextService = new ContextService();
  }

  registerCommands(): void {
    const commands = [
      {
        id: COMMANDS.SEARCH_BLOCKS,
        handler: () => searchBlocksCommand(this.embeddingsService.getClient()),
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
        handler: () => openChatCommand(this.embeddingsService.getClient()),
      },
      {
        id: COMMANDS.PARSE_ALL_NOTES,
        handler: documentParser.parseAllNotesFolder,
      },
      {
        id: COMMANDS.COPY_CONTEXT,
        handler: this.copyContext.bind(this),
      },
      {
        id: COMMANDS.ADD_BLOCK_ID,
        handler: this.addBlockId.bind(this),
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
    const context = await this.contextService.gatherContext({
      editor,
      embeddingsClient: this.embeddingsService.getClient(),
    });
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
}
import * as vscode from "vscode";
import { EmbeddingsClient } from "./embeddings";
import { blockManager } from "./blockManager";
import { updateDecorations } from "./decorations";
import { parseDocument, parseAllNotesFolder } from "./parser";
import { searchBlocksCommand } from "./commands/searchBlocks";
import { openChatCommand, gatherContext } from "./commands/chat";
import { KernelFoldingRangeProvider } from "./providers/folding";
import { spawn, exec, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

let embeddingsClient: EmbeddingsClient | undefined;
let embeddingsServerProcess: ChildProcess | undefined;

async function startEmbeddingsServer(
  context: vscode.ExtensionContext
): Promise<void> {
  const serverDir = path.join(context.extensionPath, "embeddings-server");
  const serverScript = path.join(serverDir, "server.py");

  console.log(`Extension path: ${context.extensionPath}`);
  console.log(`Server directory: ${serverDir}`);
  console.log(`Server script: ${serverScript}`);
  console.log(`Server script exists: ${fs.existsSync(serverScript)}`);

  if (!fs.existsSync(serverScript)) {
    vscode.window.showErrorMessage(
      `Embeddings server not found. Please ensure the embeddings-server directory is in the extension folder.`
    );
    return;
  }

  // Try both 'python' and 'python3' commands
  const pythonCommands = ["python3", "python", "py"];
  let started = false;
  let currentProcess: ChildProcess | undefined;

  for (const pythonCmd of pythonCommands) {
    if (started) break;

    try {
      console.log(`Trying to start embeddings server with: ${pythonCmd}`);

      currentProcess = spawn(pythonCmd, [serverScript], {
        cwd: serverDir,
        windowsHide: true,
      });

      // Check if process started successfully
      const startPromise = new Promise<boolean>((resolve) => {
        let resolved = false;
        let hasError = false;

        currentProcess!.stdout?.on("data", (data) => {
          const output = data.toString();
          console.log(`Embeddings Server stdout (${pythonCmd}): ${output}`);
          
          // Check for successful start
          if (!resolved && (
            output.toLowerCase().includes("model loaded") ||
            output.toLowerCase().includes("running on http://localhost:5000")
          )) {
            console.log(`Success! Server started with ${pythonCmd}`);
            resolved = true;
            started = true;
            embeddingsServerProcess = currentProcess;
            
            // Initialize client immediately
            embeddingsClient = new EmbeddingsClient();
            vscode.window.showInformationMessage(
              `Embeddings server started successfully using ${pythonCmd}`
            );
            // Removed setTimeout for client initialization
            
            resolve(true);
          }
        });

        currentProcess!.stderr?.on("data", (data) => {
          const error = data.toString();
          console.error(`Embeddings Server stderr (${pythonCmd}): ${error}`);
          
          // Don't treat these as errors
          if (
            error.includes("WARNING") || 
            error.includes("Debugger") ||
            error.includes("Restarting with stat") ||
            error.includes("Debug mode")
          ) {
            return;
          }
          
          // Check for actual errors
          if (error.includes("ModuleNotFoundError") || error.includes("Traceback")) {
            hasError = true;
            if (!resolved) {
              console.log(`${pythonCmd} failed due to error`);
              resolved = true;
              resolve(false);
            }
          }
        });

        currentProcess!.on("error", (error) => {
          console.error(`Failed to spawn ${pythonCmd}: ${error.message}`);
          hasError = true;
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        });

        currentProcess!.on("close", (code) => {
          console.log(`Process ${pythonCmd} exited with code ${code}`);
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        });

        // Give it time to start
        setTimeout(() => {
          if (!resolved) {
            console.log(`Timeout waiting for ${pythonCmd}`);
            resolved = true;
            resolve(false);
          }
        }, 60000); // 60 seconds should be enough to see if it starts
      });

      const success = await startPromise;
      
      if (success) {
        // We found a working Python command!
        console.log(`Successfully using ${pythonCmd}`);
        break;
      } else {
        // This attempt failed, kill it if still running
        if (currentProcess && !currentProcess.killed) {
          console.log(`Killing failed process for ${pythonCmd}`);
          currentProcess.kill();
        }
        currentProcess = undefined;
      }
      
    } catch (error: any) {
      console.error(`Exception with ${pythonCmd}:`, error);
      if (currentProcess && !currentProcess.killed) {
        currentProcess.kill();
      }
      currentProcess = undefined;
    }
  }

  if (!started) {
    vscode.window.showErrorMessage(
      "Failed to start embeddings server. Please ensure Python is installed with required packages. " +
      "Run 'Kernel: Setup Embeddings' to install dependencies."
    );
  }

  if (embeddingsServerProcess) {
    // Set up cleanup
    embeddingsServerProcess.on('close', (code) => {
      console.log('Embeddings server closed with code:', code);
      embeddingsServerProcess = undefined;
      embeddingsClient = undefined;
    });

    context.subscriptions.push({
      dispose: () => {
        if (embeddingsServerProcess && !embeddingsServerProcess.killed) {
          console.log('Disposing embeddings server');
          embeddingsServerProcess.kill();
        }
      },
    });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Start embeddings server but don't let it block activation
  startEmbeddingsServer(context).catch((error) => {
    console.error("Embeddings server startup failed:", error);
  });

  // Register folding provider
  const foldingProvider = vscode.languages.registerFoldingRangeProvider(
    "kernel-mdx",
    new KernelFoldingRangeProvider()
  );

  // Register commands
const searchBlocks = vscode.commands.registerCommand(
    "kernel-mdx.searchBlocks",
    () => searchBlocksCommand(embeddingsClient)
  );

  const setupEmbeddings = vscode.commands.registerCommand(
    "kernel-mdx.setupEmbeddings",
    async () => {
      const serverDir = path.join(context.extensionPath, "embeddings-server");
      const terminal = vscode.window.createTerminal({
        name: "Kernel Embeddings Setup",
        cwd: serverDir,
      });
      terminal.show();
      terminal.sendText("pip install -r requirements.txt");
    }
  );

  const flushBlocks = vscode.commands.registerCommand(
    "kernel-mdx.flushBlocks",
    async () => {
      blockManager.clear();
      let docCount = 0;
      vscode.workspace.textDocuments.forEach((doc) => {
        if (doc.languageId === "kernel-mdx") {
          parseDocument(doc);
          docCount++;
        }
      });
      updateDecorations();
      vscode.window.showInformationMessage(
        `Flushed block cache. Re-parsed ${docCount} document(s), found ${blockManager.size} block(s).`
      );
    }
  );

  const openChat = vscode.commands.registerCommand("kernel-mdx.openChat", () =>
    openChatCommand(embeddingsClient)
  );

  const parseAll = vscode.commands.registerCommand(
    "kernel-mdx.parseAllNotes",
    parseAllNotesFolder
  );

  const copyContext = vscode.commands.registerCommand(
    "kernel-mdx.copyContext",
    async () => {
      const editor = vscode.window.activeTextEditor;
      const context = await gatherContext(editor, embeddingsClient);
      await vscode.env.clipboard.writeText(context);
      vscode.window.showInformationMessage(
        `Copied ${context.length} characters of context to clipboard`
      );
    }
  );

  const addBlockId = vscode.commands.registerCommand(
    "kernel-mdx.addBlockId",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const position = editor.selection.active;
      const document = editor.document;

      let bracketCount = 0;
      let foundStart = false;
      let endLine = position.line;

      for (let i = position.line; i >= 0; i--) {
        const line = document.lineAt(i).text;
        for (let j = line.length - 1; j >= 0; j--) {
          if (line[j] === "]") bracketCount++;
          if (line[j] === "[") {
            bracketCount--;
            if (bracketCount < 0) {
              foundStart = true;
              break;
            }
          }
        }
        if (foundStart) break;
      }

      bracketCount = 1;
      for (let i = position.line; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        for (let j = 0; j < line.length; j++) {
          if (line[j] === "[") bracketCount++;
          if (line[j] === "]") {
            bracketCount--;
            if (bracketCount === 0) {
              endLine = i;
              const id = blockManager.generateId();
              const endOfLine = document.lineAt(i).range.end;
              editor.edit((editBuilder) => {
                editBuilder.insert(endOfLine, ` @${id}`);
              });
              return;
            }
          }
        }
      }
    }
  );

  // Register providers
  const hoverProvider = vscode.languages.registerHoverProvider("kernel-mdx", {
    provideHover(
      document: vscode.TextDocument,
      position: vscode.Position
    ): vscode.Hover | undefined {
      const range = document.getWordRangeAtPosition(
        position,
        /@([a-zA-Z0-9_]+)/
      );
      if (!range) return;

      const word = document.getText(range);
      const id = word.substring(1);

      const block = blockManager.get(id);
      if (block) {
        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(block.content, "kernel-mdx");
        markdown.isTrusted = true;
        return new vscode.Hover(markdown, range);
      }
    },
  });

  const definitionProvider = vscode.languages.registerDefinitionProvider(
    "kernel-mdx",
    {
      provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
      ): vscode.Location | undefined {
        const range = document.getWordRangeAtPosition(
          position,
          /@([a-zA-Z0-9_]+)/
        );
        if (!range) return;

        const word = document.getText(range);
        const id = word.substring(1);

        const block = blockManager.get(id);
        if (block) {
          return new vscode.Location(block.file, block.range);
        }
      },
    }
  );

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    "kernel-mdx",
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const linePrefix = document
          .lineAt(position)
          .text.substring(0, position.character);

        if (linePrefix.endsWith("[") || linePrefix.trim() === "") {
          const blockItem = new vscode.CompletionItem(
            "block",
            vscode.CompletionItemKind.Snippet
          );

          const lineText = document.lineAt(position).text;
          const charAfterCursor = lineText[position.character];
          const hasAutoClosingBracket = charAfterCursor === "]";

          if (hasAutoClosingBracket) {
            blockItem.range = new vscode.Range(
              position,
              position.translate(0, 1)
            );
            blockItem.insertText = new vscode.SnippetString(
              "\n\t$1\n] @" + blockManager.generateId()
            );
          } else {
            blockItem.insertText = new vscode.SnippetString(
              "\n\t$1\n] @" + blockManager.generateId()
            );
          }

          blockItem.documentation = new vscode.MarkdownString(
            "Create a new kernel block with auto-generated ID"
          );
          blockItem.detail = "Kernel Block";
          blockItem.sortText = "0";

          const simpleBlockItem = new vscode.CompletionItem(
            "simple block",
            vscode.CompletionItemKind.Snippet
          );
          if (hasAutoClosingBracket) {
            simpleBlockItem.range = new vscode.Range(
              position,
              position.translate(0, 1)
            );
            simpleBlockItem.insertText = new vscode.SnippetString(
              " $1 ] @" + blockManager.generateId()
            );
          } else {
            simpleBlockItem.insertText = new vscode.SnippetString(
              " $1 ] @" + blockManager.generateId()
            );
          }
          simpleBlockItem.documentation = new vscode.MarkdownString(
            "Create a single-line kernel block"
          );
          simpleBlockItem.detail = "Simple Kernel Block";

          return [blockItem, simpleBlockItem];
        }

        return undefined;
      },
    },
    "["
  );

  const atCompletionProvider = vscode.languages.registerCompletionItemProvider(
    "kernel-mdx",
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const linePrefix = document
          .lineAt(position)
          .text.substr(0, position.character);

        if (linePrefix.endsWith("@")) {
          const items: vscode.CompletionItem[] = [];

          for (const [id, block] of blockManager.entries()) {
            const contentPreview = block.content
              .replace(/\n/g, " ")
              .substring(0, 80)
              .trim();

            const item = new vscode.CompletionItem(
              contentPreview + (block.content.length > 80 ? "..." : ""),
              vscode.CompletionItemKind.Reference
            );

            item.detail = `@${id}`;
            item.insertText = id;
            item.documentation = new vscode.MarkdownString();
            item.documentation.appendCodeblock(block.content, "kernel-mdx");
            item.filterText = id + " " + block.content.replace(/\n/g, " ");

            items.push(item);
          }

          return items;
        }

        return undefined;
      },
    },
    "@"
  );

  // Event listeners
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (event.document.languageId === "kernel-mdx") {
        parseDocument(event.document);
      }
    }
  );

  const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(
    (document) => {
      if (document.languageId === "kernel-mdx") {
        parseDocument(document);
      }
    }
  );

  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    }
  );

  // Initial setup
  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.languageId === "kernel-mdx") {
      parseDocument(doc);
    }
  });

  updateDecorations();
  parseAllNotesFolder();

  // Register all disposables
  context.subscriptions.push(
    foldingProvider,
    hoverProvider,
    definitionProvider,
    completionProvider,
    atCompletionProvider,
    searchBlocks,
    setupEmbeddings,
    flushBlocks,
    openChat,
    parseAll,
    copyContext,
    addBlockId,
    onDidChangeTextDocument,
    onDidOpenTextDocument,
    onDidChangeActiveTextEditor
  );
}

export function deactivate() {
  if (embeddingsServerProcess) {
    embeddingsServerProcess.kill();
  }
}

import * as vscode from "vscode";
import { blockManager } from "../blockManager";
import { KernelFoldingRangeProvider } from "./folding";

export class ProviderService {
  constructor(private context: vscode.ExtensionContext) {}

  registerProviders(): void {
    this.registerFoldingProvider();
    this.registerHoverProvider();
    this.registerDefinitionProvider();
    this.registerCompletionProviders();
  }

  private registerFoldingProvider(): void {
    this.context.subscriptions.push(
      vscode.languages.registerFoldingRangeProvider(
        "kernel-mdx",
        new KernelFoldingRangeProvider()
      )
    );
  }

  private registerHoverProvider(): void {
    this.context.subscriptions.push(
      vscode.languages.registerHoverProvider("kernel-mdx", {
        provideHover(document, position) {
          const range = document.getWordRangeAtPosition(
            position,
            /@([a-zA-Z0-9_]+)/
          );
          if (!range) return;

          const word = document.getText(range);
          const id = word.substring(1);
          const block = blockManager.tryGet(id);

          if (block) {
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(block.content, "kernel-mdx");
            markdown.isTrusted = true;
            return new vscode.Hover(markdown, range);
          }
        },
      })
    );
  }

  private registerDefinitionProvider(): void {
    this.context.subscriptions.push(
      vscode.languages.registerDefinitionProvider("kernel-mdx", {
        provideDefinition(document, position) {
          const range = document.getWordRangeAtPosition(
            position,
            /@([a-zA-Z0-9_]+)/
          );
          if (!range) return;

          const word = document.getText(range);
          const id = word.substring(1);
          const block = blockManager.tryGet(id);

          if (block) {
            return new vscode.Location(block.file, block.range);
          }
        },
      })
    );
  }

  private registerCompletionProviders(): void {
    // Block creation completions
    this.context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        "kernel-mdx",
        {
          provideCompletionItems(document, position) {
            const linePrefix = document
              .lineAt(position)
              .text.substring(0, position.character);

            if (linePrefix.endsWith("[") || linePrefix.trim() === "") {
              return createBlockCompletions(document, position);
            }
          },
        },
        "["
      )
    );

    // Block reference completions
    this.context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        "kernel-mdx",
        {
          provideCompletionItems(document, position) {
            const linePrefix = document
              .lineAt(position)
              .text.substring(0, position.character);

            if (linePrefix.endsWith("@")) {
              return createReferenceCompletions();
            }
          },
        },
        "@"
      )
    );
  }
}

function createBlockCompletions(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.CompletionItem[] {
  const lineText = document.lineAt(position).text;
  const charAfterCursor = lineText[position.character];
  const hasAutoClosingBracket = charAfterCursor === "]";

  const blockItem = new vscode.CompletionItem(
    "block",
    vscode.CompletionItemKind.Snippet
  );

  if (hasAutoClosingBracket) {
    blockItem.range = new vscode.Range(position, position.translate(0, 1));
  }

  blockItem.insertText = new vscode.SnippetString(
    `\n\t$1\n] @${blockManager.generateId()}`
  );
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
    simpleBlockItem.range = new vscode.Range(position, position.translate(0, 1));
  }

  simpleBlockItem.insertText = new vscode.SnippetString(
    ` $1 ] @${blockManager.generateId()}`
  );
  simpleBlockItem.documentation = new vscode.MarkdownString(
    "Create a single-line kernel block"
  );
  simpleBlockItem.detail = "Simple Kernel Block";

  return [blockItem, simpleBlockItem];
}

function createReferenceCompletions(): vscode.CompletionItem[] {
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
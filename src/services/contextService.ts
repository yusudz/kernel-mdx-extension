import * as vscode from "vscode";
import * as path from "path";
import { blockManager } from "../blockManager";
import { EmbeddingsService } from "./embeddingsService";

export interface ContextOptions {
  editor?: vscode.TextEditor;
  query?: string;
  alwaysIncludeFiles?: string[];
  maxSemanticResults?: number;
  maxRecentBlocks?: number;
}

export class ContextService {
  constructor(private embeddingsService: EmbeddingsService) {}

  async gatherContext(options: ContextOptions = {}): Promise<string> {
    const {
      editor,
      query,
      alwaysIncludeFiles = this.getAlwaysIncludeFiles(),
      maxSemanticResults = 10,
      maxRecentBlocks = 10,
    } = options;

    const contextParts: string[] = [];
    const includedBlockIds = new Set<string>();

    // 1. Always include specified files
    const alwaysIncludeParts = await this.includeAlwaysIncludeFiles(alwaysIncludeFiles);
    contextParts.push(...alwaysIncludeParts);

    // 2. Current file content
    if (editor) {
      const currentFilePart = this.getCurrentFileContext(editor);
      contextParts.push(currentFilePart);

      // 3. Get referenced blocks from current file
      const referencedBlocks = this.getReferencedBlocks(editor, includedBlockIds);
      contextParts.push(...referencedBlocks);
    }

    // 4. Semantic search for relevant blocks
    if (this.embeddingsService.isReady() && query?.trim()) {
      const semanticBlocks = await this.getSemanticBlocks(
        query,
        includedBlockIds,
        maxSemanticResults
      );
      if (semanticBlocks.length > 0) {
        contextParts.push("\n// Semantically related blocks");
        contextParts.push(...semanticBlocks);
      }
    }

    // 5. Recent blocks
    const recentBlocks = this.getRecentBlocks(includedBlockIds, maxRecentBlocks);
    if (recentBlocks) {
      contextParts.push(`\n// Recent blocks\n${recentBlocks}`);
    }

    return contextParts.join("\n\n---\n\n");
  }

  private getAlwaysIncludeFiles(): string[] {
    const config = vscode.workspace.getConfiguration("kernel");
    return config.get<string[]>("alwaysIncludeFiles", ["kernel_instructions.mdx"]);
  }

  private async includeAlwaysIncludeFiles(filenames: string[]): Promise<string[]> {
    const parts: string[] = [];
    
    for (const filename of filenames) {
      try {
        const files = await vscode.workspace.findFiles(`**/${filename}`);
        if (files.length > 0) {
          const doc = await vscode.workspace.openTextDocument(files[0]);
          parts.push(`// ${filename}\n${doc.getText()}`);
        }
      } catch (error) {
        console.error(`Failed to include ${filename}:`, error);
      }
    }
    
    return parts;
  }

  private getCurrentFileContext(editor: vscode.TextEditor): string {
    const fileName = path.basename(editor.document.fileName);
    return `\n// Current file: ${fileName}\n${editor.document.getText()}`;
  }

  private getReferencedBlocks(
    editor: vscode.TextEditor,
    includedBlockIds: Set<string>
  ): string[] {
    const parts: string[] = [];
    const text = editor.document.getText();
    const refRegex = /(?<!\]\s*)@([a-zA-Z0-9_]+)\b/g;
    let match;

    while ((match = refRegex.exec(text)) !== null) {
      const id = match[1];
      if (!includedBlockIds.has(id) && blockManager.has(id)) {
        const block = blockManager.get(id)!;
        includedBlockIds.add(id);
        parts.push(`\n// Referenced block @${id}\n${block.content}`);
      }
    }

    return parts;
  }

  private async getSemanticBlocks(
    query: string,
    includedBlockIds: Set<string>,
    maxResults: number
  ): Promise<string[]> {
    const parts: string[] = [];
    
    try {
      const allBlocks = Array.from(blockManager.entries())
        .filter(([id]) => !includedBlockIds.has(id))
        .map(([id, block]) => ({
          id,
          content: block.content,
        }));

      if (allBlocks.length === 0) {
        return parts;
      }

      const results = await this.embeddingsService.findSimilar(query, allBlocks, maxResults);

      for (const result of results) {
        const block = allBlocks[result.index];
        parts.push(
          `\n// Related block @${block.id} (score: ${result.score.toFixed(3)})\n${block.content}`
        );
        includedBlockIds.add(block.id);
      }
    } catch (error) {
      console.error("Semantic search failed:", error);
    }

    return parts;
  }

  private getRecentBlocks(
    includedBlockIds: Set<string>,
    maxBlocks: number
  ): string {
    const recentBlocks = Array.from(blockManager.entries())
      .filter(([id]) => !includedBlockIds.has(id))
      .slice(-maxBlocks)
      .map(([id, block]) => `@${id}: ${block.content}`)
      .join("\n\n");

    return recentBlocks;
  }
}
import { EmbeddingsService } from "./EmbeddingsService";
import { BlockParser } from "./BlockParser";
import { ConfigManager } from "./storage/ConfigManager";
import { FileStorage } from "./storage/FileStorage";
import { ConversationMessage } from "../types";
import * as fs from "fs/promises";

export interface ContextOptions {
  currentContent?: string;
  currentFileName?: string;
  query?: string;
  alwaysIncludeFiles?: string[];
  maxSemanticResults?: number;
  maxRecentBlocks?: number;
}

export class ContextService {
  constructor(
    private embeddingsService: EmbeddingsService,
    private blockParser: BlockParser,
    private configManager: ConfigManager,
    private fileStorage: FileStorage
  ) {
    
  }

  async gatherContext(options: ContextOptions = {}): Promise<string> {
    const {
      currentContent,
      currentFileName,
      query,
      alwaysIncludeFiles = this.getAlwaysIncludeFiles(),
      maxSemanticResults = 50,
      maxRecentBlocks = 20,
    } = options;

    const contextParts: string[] = [];
    const includedBlockIds = new Set<string>();

    // 1. Always include specified files
    const alwaysIncludeParts = await this.includeAlwaysIncludeFiles(
      alwaysIncludeFiles
    );
    contextParts.push(...alwaysIncludeParts);

    // 2. Current file content (if provided)
    if (currentContent && currentFileName) {
      contextParts.push(`\n// Current file: ${currentFileName}\n${currentContent}`);

      // 3. Get referenced blocks from current content
      const referencedBlocks = this.getReferencedBlocks(
        currentContent,
        includedBlockIds
      );
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

    // 5. Log-based context (organized logs + current active log)
    const logContext = await this.getLogBasedContext();
    if (logContext.length > 0) {
      contextParts.push(...logContext);
    }

    return contextParts.join("\n\n---\n\n");
  }

  private getAlwaysIncludeFiles(): string[] {
    const files = this.configManager.get('alwaysIncludeFiles');
    return Array.isArray(files) ? files : ['kernel_instructions.mdx'];
  }

  private async includeAlwaysIncludeFiles(
    filenames: string[]
  ): Promise<string[]> {
    const parts: string[] = [];

    for (const filename of filenames) {
      try {
        // Look for the file in the blocks directory
        const files = await this.fileStorage.findFiles(filename);
        if (files.length > 0) {
          const content = await fs.readFile(files[0], 'utf-8');
          parts.push(`// ${filename}\n${content}`);
        }
      } catch (error) {
        console.error(`Failed to include ${filename}:`, error);
      }
    }

    return parts;
  }

  private getReferencedBlocks(
    content: string,
    includedBlockIds: Set<string>
  ): string[] {
    const parts: string[] = [];
    const refRegex = /(?<!\]\s*)@([a-zA-Z0-9_]+)\b/g;
    let match;

    while ((match = refRegex.exec(content)) !== null) {
      const id = match[1];
      if (!includedBlockIds.has(id)) {
        const block = this.blockParser.getBlock(id);
        if (block) {
          includedBlockIds.add(id);
          parts.push(`\n// Referenced block @${id}\n${block.content}`);
        }
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
      const allBlocks = this.blockParser.getAllBlocks()
        .filter(block => !includedBlockIds.has(block.id))
        .map(block => ({
          id: block.id,
          content: block.content,
        }));

      if (allBlocks.length === 0) {
        return parts;
      }

      const results = await this.embeddingsService.findSimilar(
        query,
        allBlocks,
        maxResults
      );

      for (const result of results) {
        const block = allBlocks[result.index];
        parts.push(
          `\n// Related block @${block.id} (score: ${result.score.toFixed(
            3
          )})\n${block.content}`
        );
        includedBlockIds.add(block.id);
      }
    } catch (error) {
      console.error("Semantic search failed:", error);
    }

    return parts;
  }

  private async getLogBasedContext(): Promise<string[]> {
    const contextParts: string[] = [];
    
    try {
      // 1. Include all organized log files
      const organizedLogFiles = this.fileStorage.getOrganizedLogFiles();
      for (const filePath of organizedLogFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          if (content.trim()) {
            const fileName = filePath.split('/').pop() || 'organized_log';
            contextParts.push(`// Organized log: ${fileName}\n${content.trim()}`);
          }
        } catch (error) {
          console.error(`Failed to read organized log file ${filePath}:`, error);
        }
      }
      
      // 2. Include current active log content
      const activeLogContent = this.fileStorage.getCurrentActiveLogContent();
      if (activeLogContent.trim()) {
        contextParts.push(`// Current active log\n${activeLogContent.trim()}`);
      }
      
    } catch (error) {
      console.error('Failed to gather log-based context:', error);
    }
    
    return contextParts;
  }
}
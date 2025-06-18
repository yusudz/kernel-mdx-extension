import { EmbeddingsService } from "./EmbeddingsService";
import { OpenAiService } from "./ai/OpenAiService";
import { GeminiService } from "./ai/GeminiService";
import { BlockParser } from "./BlockParser";
import { ConfigManager } from "./storage/ConfigManager";
import { FileStorage } from "./storage/FileStorage";
import { ConversationMessage } from "../types";
import * as path from "path";
import * as fs from "fs/promises";

export interface ContextOptions {
  currentContent?: string;
  currentFileName?: string;
  query?: string;
  alwaysIncludeFiles?: string[];
  maxSemanticResults?: number;
  maxRecentBlocks?: number;
}

const DEFAULT_CONFIG = {
  OPENAI_MODEL: 'gpt-4',
  GEMINI_MODEL: 'gemini-pro',
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.7
};

export class ContextService {
  private openAiService?: OpenAiService;
  private geminiService?: GeminiService;

  constructor(
    private embeddingsService: EmbeddingsService,
    private blockParser: BlockParser,
    private configManager: ConfigManager,
    private fileStorage: FileStorage
  ) {
    this.initializeAiServices();
  }

  private initializeAiServices(): void {
    // Initialize OpenAI service for compression if API key is available
    const openAiApiKey = this.configManager.get('openaiApiKey');
    const openAiModel = this.configManager.get('openaiModel') || DEFAULT_CONFIG.OPENAI_MODEL;

    if (openAiApiKey) {
      this.openAiService = new OpenAiService({
        apiKey: openAiApiKey,
        model: openAiModel,
        maxTokens: DEFAULT_CONFIG.MAX_TOKENS,
        temperature: DEFAULT_CONFIG.TEMPERATURE,
      });
    }

    // Initialize Gemini service for compression if API key is available
    const geminiApiKey = this.configManager.get('geminiApiKey');
    const geminiModel = this.configManager.get('geminiModel') || DEFAULT_CONFIG.GEMINI_MODEL;

    if (geminiApiKey) {
      this.geminiService = new GeminiService({
        apiKey: geminiApiKey,
        model: geminiModel,
        maxOutputTokens: DEFAULT_CONFIG.MAX_TOKENS,
        temperature: DEFAULT_CONFIG.TEMPERATURE,
      });
    }
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

    // 5. Recent blocks
    const recentBlocks = this.getRecentBlocks(
      includedBlockIds,
      maxRecentBlocks
    );
    if (recentBlocks) {
      contextParts.push(`\n// Recent blocks\n${recentBlocks}`);
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

  private getRecentBlocks(
    includedBlockIds: Set<string>,
    maxBlocks: number
  ): string {
    const blocks = this.blockParser.getAllBlocks();
    const recentBlocks = blocks
      .filter(block => !includedBlockIds.has(block.id))
      .slice(-maxBlocks)
      .map(block => `@${block.id}: ${block.content}`)
      .join("\n\n");

    return recentBlocks;
  }

  async compressContext(
    context: string,
    query: string,
    history: ConversationMessage[] = []
  ): Promise<string> {
    if (!this.geminiService) {
      // No compression available, return as-is
      console.warn("Gemini service not initialized, skipping context compression.");
      return context;
    }

    try {
      return await this.geminiService.compressContext(context, query, history);
    } catch (error) {
      console.error("Context compression failed:", error);
      return context; // Return original on failure
    }
  }
}
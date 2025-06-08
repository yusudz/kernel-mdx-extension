import { PythonServerManager } from "./pythonServerManager";
import { EmbeddingsClient } from "../embeddings";
import { eventBus } from '../events/eventBus';
import { DEFAULT_CONFIG } from "../constants";
import * as crypto from 'crypto';
import { Disposable } from "vscode";

export interface EmbeddingsServiceOptions {
  serverDir: string;
  serverScript: string;
  maxStartupTime: number;
  pythonCommands: string[];
}

interface CachedEmbedding {
  contentHash: string;
  embedding: number[];
  timestamp: number;
}

export class EmbeddingsService {
  private serverManager: PythonServerManager;
  private client?: EmbeddingsClient;
  private cache = new Map<string, CachedEmbedding>(); //TODO: LRU cache or max size limit
  private eventListeners: Array<Disposable> = [];

  constructor(private options: EmbeddingsServiceOptions) {
    this.serverManager = new PythonServerManager({
      serverDir: options.serverDir,
      serverScript: options.serverScript,
      port: DEFAULT_CONFIG.EMBEDDINGS_PORT,
      maxStartupTime: options.maxStartupTime,
      pythonCommands: options.pythonCommands,
      readyWhen: {
        stdout: /model loaded/i,
      }
    });

    // Listen for server ready event
    this.serverManager.on('ready', () => {
      this.client = new EmbeddingsClient(this.serverManager);
      console.log('Embeddings client initialized');
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventListeners.push(
      eventBus.on('block:removed', ({ id }) => {
        this.cache.delete(id);
      })
    );

    this.eventListeners.push(
      eventBus.on('blocks:cleared', () => {
        this.cache.clear();
      })
    );
  }

  async start(): Promise<void> {
    await this.serverManager.start();
  }

  stop(): void {
    this.serverManager.stop();
    this.client = undefined;
    
    // Clean up event listeners
    this.eventListeners.forEach(disposable => disposable.dispose());
    this.eventListeners = [];
  }

  isReady(): boolean {
    return this.serverManager.isReady() && this.client !== undefined;
  }

  private ensureReady(): void {
    if (!this.isReady()) {
      throw new Error('Embeddings service not ready. Server may still be starting up. Please wait a moment and try again.');
    }
  }

  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async embed(texts: string | string[]): Promise<number[][]> {
    this.ensureReady();
    const response = await this.client!.embed(texts);
    return response.embeddings;
  }

  async findSimilar(
    query: string,
    blocks: Array<{ id: string; content: string }>,
    topK: number = 10
  ): Promise<Array<{ chunk: string; score: number; index: number }>> {
    this.ensureReady();

    // Get all embeddings (using cache where possible)
    const embeddings = await this.getBlockEmbeddings(blocks);
    
    // Get query embedding
    const [queryEmbedding] = await this.embed(query);

    // Calculate similarities using the server
    const similarities = await this.client!.vectorSimilarity(queryEmbedding, embeddings);

    // Create results array
    const results = similarities.map((score, i) => ({
      chunk: blocks[i].content,
      score: score,
      index: i
    }));

    // Sort by score descending and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private async getBlockEmbeddings(blocks: Array<{ id: string; content: string }>): Promise<number[][]> {
    const embeddings: number[][] = [];
    const uncachedIndices: number[] = [];
    const uncachedContents: string[] = [];

    // Check cache for each block
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const contentHash = this.hashContent(block.content);
      const cached = this.cache.get(block.id);

      if (cached && cached.contentHash === contentHash) {
        embeddings[i] = cached.embedding;
      } else {
        uncachedIndices.push(i);
        uncachedContents.push(block.content);
      }
    }

    // Get embeddings for uncached blocks
    if (uncachedContents.length > 0) {
      const newEmbeddings = await this.embed(uncachedContents);

      // Cache and insert the new embeddings
      for (let i = 0; i < uncachedIndices.length; i++) {
        const index = uncachedIndices[i];
        const block = blocks[index];
        const embedding = newEmbeddings[i];
        
        this.cache.set(block.id, {
          contentHash: this.hashContent(block.content),
          embedding,
          timestamp: Date.now(),
        });
        
        embeddings[index] = embedding;
      }
    }

    return embeddings;
  }

  getCacheStats(): { totalCached: number } {
    return { totalCached: this.cache.size };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
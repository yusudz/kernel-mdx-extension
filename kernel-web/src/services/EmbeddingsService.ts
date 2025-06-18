import { PythonServerManager } from "./PythonServerManager";
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

export interface EmbeddingsServiceOptions {
  serverManager: PythonServerManager;
}

interface CachedEmbedding {
  contentHash: string;
  embedding: number[];
  timestamp: number;
}

interface EmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
}

interface SimilarityResult {
  chunk: string;
  score: number;
  index: number;
}

export class EmbeddingsService extends EventEmitter {
  private cache = new Map<string, CachedEmbedding>();
  private ready = false;

  constructor(private serverManager: PythonServerManager) {
    super();

    // Listen for server ready event
    this.serverManager.on('ready', () => {
      this.ready = true;
      console.log('Embeddings service ready');
    });

    // Listen for server stopped event
    this.serverManager.on('stopped', () => {
      this.ready = false;
    });
  }

  isReady(): boolean {
    return this.ready && this.serverManager.isReady();
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
    
    const response = await this.serverManager.fetch('/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding failed: ${response.status} - ${error}`);
    }

    const data: EmbeddingResponse = await response.json();
    return data.embeddings;
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
    const response = await this.serverManager.fetch('/vector_similarity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors_a: queryEmbedding,
        vectors_b: embeddings
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Similarity calculation failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const similarities: number[] = data.similarities;

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

  removeFromCache(id: string): void {
    this.cache.delete(id);
  }

  clearMultipleFromCache(ids: string[]): void {
    ids.forEach(id => this.cache.delete(id));
  }
}
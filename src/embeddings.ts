import { PythonClient } from './services/pythonClient';

interface EmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
}

interface SimilarityResult {
  chunk: string;
  score: number;
  index: number;
}

export class EmbeddingsClient extends PythonClient {
  
  async embed(texts: string | string[]): Promise<EmbeddingResponse> {
    return this.post('/embed', { texts });
  }

  async findSimilar(query: string, chunks: string[], topK?: number): Promise<SimilarityResult[]> {
    const results = await this.post<SimilarityResult[]>('/similarity', { 
      query, 
      chunks 
    });
    return topK ? results.slice(0, topK) : results;
  }

  async vectorSimilarity(
    vectorsA: number[] | number[][], 
    vectorsB: number[] | number[][]
  ): Promise<number[]> {
    const result = await this.post<{ similarities: number[] }>('/vector_similarity', {
      vectors_a: vectorsA,
      vectors_b: vectorsB
    });
    return result.similarities;
  }
}

export { EmbeddingResponse, SimilarityResult };
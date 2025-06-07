// Example TypeScript client for the embeddings server

interface EmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
}

interface SimilarityResult {
  chunk: string;
  score: number;
  index: number;
}

class EmbeddingsClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  async embed(texts: string | string[]): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts })
    });
    
    if (!response.ok) {
      throw new Error(`Embedding failed: ${await response.text()}`);
    }
    
    return response.json();
  }

  async findSimilar(query: string, chunks: string[], topK?: number): Promise<SimilarityResult[]> {
    const response = await fetch(`${this.baseUrl}/similarity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, chunks })
    });
    
    if (!response.ok) {
      throw new Error(`Similarity search failed: ${await response.text()}`);
    }
    
    const results: SimilarityResult[] = await response.json();
    return topK ? results.slice(0, topK) : results;
  }
}

// Usage example
async function testEmbeddings() {
  const client = new EmbeddingsClient();
  
  // Test your actual Kernel use case
  const query = "What are the key features of the product?";
  const chunks = [
    "The product supports real-time collaboration",
    "Available in three pricing tiers: Basic, Pro, and Enterprise",
    "Built with TypeScript and React",
    "Includes 24/7 customer support for Pro users",
    "Features include version control and automatic backups",
    "Compatible with Windows, macOS, and Linux",
    "Mobile app available for iOS and Android",
    "API access included in Enterprise plan",
  ];
  
  console.log('Finding relevant context for:', query);
  const topK = 5;
  const results = await client.findSimilar(query, chunks, topK);

  console.log(`\nTop ${topK} relevant chunks:`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. (Score: ${r.score.toFixed(3)}) ${r.chunk}`);
  });
}

// ES module way to check if file is run directly
// import { fileURLToPath } from 'url';
// import { argv } from 'process';

// if (argv[1] === fileURLToPath(import.meta.url)) {
//   testEmbeddings().catch(console.error);
// }

export { EmbeddingsClient, EmbeddingResponse, SimilarityResult };
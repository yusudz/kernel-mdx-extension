from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
import numpy as np
import time

app = Flask(__name__)
CORS(app)  # Enable CORS for local development

print("Loading model... (this takes ~30 seconds on first run)")
start_time = time.time()
model = SentenceTransformer('all-MiniLM-L6-v2')
print(f"Model loaded in {time.time() - start_time:.1f} seconds")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "model": "all-MiniLM-L6-v2"})

@app.route('/embed', methods=['POST'])
def embed():
    try:
        data = request.json
        texts = data['texts']
        
        # Handle single text or list
        if isinstance(texts, str):
            texts = [texts]
        
        embeddings = model.encode(texts)
        
        return jsonify({
            "embeddings": embeddings.tolist(),
            "dimensions": embeddings.shape[1]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/similarity', methods=['POST'])
def similarity():
    try:
        data = request.json
        query = data['query']
        chunks = data['chunks']
        
        # Encode query and chunks
        query_emb = model.encode([query])[0]
        chunk_embs = model.encode(chunks)
        
        # Calculate cosine similarities
        # Normalize vectors
        query_norm = query_emb / np.linalg.norm(query_emb)
        chunk_norms = chunk_embs / np.linalg.norm(chunk_embs, axis=1, keepdims=True)
        
        # Dot product of normalized vectors = cosine similarity
        similarities = np.dot(chunk_norms, query_norm)
        
        # Create results with scores
        results = []
        for i, (chunk, score) in enumerate(zip(chunks, similarities)):
            results.append({
                "chunk": chunk,
                "score": float(score),
                "index": i
            })
        
        # Sort by score descending
        results.sort(key=lambda x: x['score'], reverse=True)
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    print("\nEmbeddings server running on http://localhost:5000")
    print("Test with: curl http://localhost:5000/health")
    app.run(debug=True, port=5000)
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

@app.route('/vector_similarity', methods=['POST'])
def vector_similarity():
    """Calculate cosine similarity between two vectors or vector arrays"""
    try:
        data = request.json
        vectors_a = np.array(data['vectors_a'])
        vectors_b = np.array(data['vectors_b'])
        
        # Handle single vector vs array of vectors
        if vectors_a.ndim == 1:
            vectors_a = vectors_a.reshape(1, -1)
        if vectors_b.ndim == 1:
            vectors_b = vectors_b.reshape(1, -1)
        
        # Normalize vectors
        norms_a = np.linalg.norm(vectors_a, axis=1, keepdims=True)
        norms_b = np.linalg.norm(vectors_b, axis=1, keepdims=True)
        
        vectors_a_norm = vectors_a / norms_a
        vectors_b_norm = vectors_b / norms_b
        
        # Calculate cosine similarities
        if vectors_a.shape[0] == 1:
            # One-to-many: compare single vector_a to all vectors_b
            similarities = np.dot(vectors_b_norm, vectors_a_norm.T).flatten()
        elif vectors_b.shape[0] == 1:
            # Many-to-one: compare all vectors_a to single vector_b
            similarities = np.dot(vectors_a_norm, vectors_b_norm.T).flatten()
        elif vectors_a.shape[0] == vectors_b.shape[0]:
            # Pairwise: compare corresponding vectors
            similarities = np.sum(vectors_a_norm * vectors_b_norm, axis=1)
        else:
            # Many-to-many: full similarity matrix
            similarities = np.dot(vectors_a_norm, vectors_b_norm.T)
        
        return jsonify({
            "similarities": similarities.tolist()
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    print("\nEmbeddings server running on http://localhost:5000")
    print("Test with: curl http://localhost:5000/health")
    app.run(debug=True, port=5000)
# Embeddings Server for Project Kernel

A simple Python server that provides embedding and similarity search capabilities for Kernel's context retrieval.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
```

2. Install dependencies:
```bash
pip install flask sentence-transformers numpy cors
```

3. Run the server:
```bash
python server.py
```

The server will start on `http://localhost:5000`

## API Endpoints

### POST /embed
Get embeddings for text(s)
```json
{
  "texts": ["text to embed", "another text"]
}
```

### POST /similarity
Find most similar chunks to a query
```json
{
  "query": "Can I afford to move out?",
  "chunks": ["Monthly income: $4,800", "Rent would be $1,500"]
}
```

## Usage from TypeScript

See `client.ts` for example usage.
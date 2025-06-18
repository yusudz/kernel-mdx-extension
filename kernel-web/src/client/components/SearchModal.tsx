import React, { useState, useRef, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface SearchResult {
  id: string;
  content: string;
  file: string;
  line: number;
  score?: number;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<'text' | 'semantic'>('text');
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      // Reset search state when modal opens
      setHasSearched(false);
      setResults([]);
      setError(null);
    }
  }, [isOpen]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const response = await apiService.searchBlocks({
        query: query.trim(),
        semantic: true,
        maxResults: 20,
        minScore: 0.0
      });
      
      setResults(response.blocks);
      setSearchType(response.searchType);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Search Blocks</h2>
          <button className="btn-danger" onClick={onClose} style={{ padding: '8px 12px', border: 'none' }}>
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-group">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='e.g., "Paris", "swimming", "food"'
              className="search-input"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !query.trim()} className="search-btn">
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="search-results">
          {results.length > 0 && (
            <div className="results-header">
              <h3>Search Results: "{query}"</h3>
              <p>Found {results.length} relevant blocks ({searchType} search)</p>
            </div>
          )}
          
          {results.map((result, index) => (
            <div key={result.id} className="search-result">
              <div className="result-header">
                <span className="result-number">{index + 1}.</span>
                <span className="result-id">@{result.id}</span>
                {searchType === 'semantic' && result.score !== undefined && (
                  <span className="result-score">Score: {result.score.toFixed(3)}</span>
                )}
              </div>
              <div className="result-file">
                File: {result.file ? result.file.split('/').pop() : 'Unknown'} (line {result.line})
              </div>
              <div className="result-content">
                {result.content}
              </div>
            </div>
          ))}
          
          {!loading && hasSearched && results.length === 0 && !error && (
            <div className="no-results">
              No blocks found for "{query}". Try different search terms.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
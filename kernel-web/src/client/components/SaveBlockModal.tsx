import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface SaveBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string;
}

const SaveBlockModal: React.FC<SaveBlockModalProps> = ({
  isOpen,
  onClose,
  initialContent
}) => {
  const [content, setContent] = useState('');
  const [blockId, setBlockId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const minHeight = 100;
      const maxHeight = 300;
      textareaRef.current.style.height = Math.max(minHeight, Math.min(scrollHeight, maxHeight)) + 'px';
    }
  };

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent);
      setBlockId('');
      setError('');
    }
  }, [isOpen, initialContent]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(adjustTextareaHeight, 0); // Delay to ensure content is set
    }
  }, [isOpen, content]);

  const handleSave = async () => {
    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await apiService.saveBlock(
        content.trim(),
        blockId.trim() || undefined
      );
      
      if (result.success) {
        const idMessage = result.generatedId && !blockId.trim() 
          ? ` Generated ID: ${result.generatedId}.` 
          : '';
        alert(`Block saved successfully!${idMessage} ${result.blockCount} total blocks.`);
        onClose();
      }
    } catch (error) {
      setError('Failed to save block');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Save as Block</h3>
          <button className="btn-danger" onClick={onClose} style={{ padding: '8px 12px', border: 'none' }}>
            ✕
          </button>
        </div>
        
        <div className="form-group">
          <label className="form-label">Content:</label>
          <textarea
            ref={textareaRef}
            className="form-textarea"
            placeholder="Enter block content..."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setTimeout(adjustTextareaHeight, 0);
            }}
            disabled={isLoading}
            style={{
              resize: 'none',
              minHeight: '100px',
              maxHeight: '300px',
              overflow: 'auto'
            }}
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">Block ID (optional):</label>
          <input
            type="text"
            className="form-input"
            placeholder="auto-generated if empty"
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            disabled={isLoading}
          />
        </div>
        
        {error && (
          <div style={{ color: '#dc3545', marginBottom: '16px' }}>
            {error}
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            className="send-btn" 
            onClick={handleSave} 
            disabled={isLoading}
            style={{ background: isLoading ? '#6c757d' : '#28a745' }}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveBlockModal;
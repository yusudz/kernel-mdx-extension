import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface Conversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; timestamp: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

interface ConversationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

const ConversationsModal: React.FC<ConversationsModalProps> = ({
  isOpen,
  onClose,
  onSelectConversation
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  const loadConversations = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const data = await apiService.getConversations();
      setConversations(data);
    } catch (error) {
      setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    onSelectConversation(conversationId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Conversations</h3>
          <button className="btn-danger" onClick={onClose} style={{ padding: '8px 12px', border: 'none' }}>
            ✕
          </button>
        </div>
        
        {isLoading && <div>Loading conversations...</div>}
        
        {error && (
          <div style={{ color: '#dc3545', marginBottom: '16px' }}>
            {error}
          </div>
        )}
        
        {!isLoading && !error && conversations.length === 0 && (
          <div>No conversations yet.</div>
        )}
        
        {!isLoading && conversations.length > 0 && (
          <div>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="conversation-item"
                onClick={() => handleSelectConversation(conv.id)}
              >
                <strong>{conv.title}</strong>
                <br />
                <small>
                  {conv.messages.length} messages • {new Date(conv.updatedAt).toLocaleDateString()}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationsModal;
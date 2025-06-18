import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';

interface HeaderProps {
  conversationTitle: string;
  onNewConversation: () => void;
  onShowConversations: () => void;
  isCollapsed: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  conversationTitle, 
  onNewConversation, 
  onShowConversations,
  isCollapsed 
}) => {
  const { logout } = useAuth();
  const [status, setStatus] = useState('Checking server status...');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await apiService.getHealth();
        setStatus(
          `Server running. Blocks: ${data.blocks || 0}. Embeddings: ${data.embeddings ? 'Ready' : 'Starting...'}`
        );
      } catch (error) {
        setStatus('Connection error');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`header ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="header-top">
        <div className="header-title">
          <h1>Kernel Web Chat</h1>
        </div>
        <button 
          className="mobile-menu-toggle"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {showMobileMenu ? (
              <polyline points="18,15 12,9 6,15"></polyline>
            ) : (
              <polyline points="6,9 12,15 18,9"></polyline>
            )}
          </svg>
        </button>
      </div>
      
      <div className={`header-controls ${showMobileMenu ? 'mobile-menu-open' : ''}`}>
        <div className="header-actions">
          <button className="btn-primary" onClick={onNewConversation}>
            New Chat
          </button>
          <button className="btn-secondary" onClick={onShowConversations}>
            Conversations
          </button>
          <button className="btn-danger" onClick={logout}>
            Logout
          </button>
        </div>
        
        <div className="conversation-info">
          <div className="conversation-title">{conversationTitle}</div>
          <div className="server-status">{status}</div>
        </div>
      </div>
    </div>
  );
};

export default Header;
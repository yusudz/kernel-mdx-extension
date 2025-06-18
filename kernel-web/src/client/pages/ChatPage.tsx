import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import AuthSetup from '../components/AuthSetup';
import Login from '../components/Login';
import Header from '../components/Header';
import ChatContainer from '../components/ChatContainer';
import MessageInput from '../components/MessageInput';
import ConversationsModal from '../components/ConversationsModal';
import SaveBlockModal from '../components/SaveBlockModal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, needsSetup, isLoading: authLoading } = useAuth();
  
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveBlockContent, setSaveBlockContent] = useState('');
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [showSaveBlock, setShowSaveBlock] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      if (conversationId) {
        loadConversation(conversationId);
      } else {
        createNewConversation();
      }
    }
  }, [isAuthenticated, conversationId]);

  const loadConversation = async (id: string) => {
    try {
      const conv = await apiService.getConversation(id);
      setConversation(conv);
      
      // Clear save block content when loading conversation
      setSaveBlockContent('');
    } catch (error) {
      console.error('Failed to load conversation:', error);
      createNewConversation();
    }
  };

  const createNewConversation = async () => {
    try {
      const newConv = await apiService.createConversation();
      setConversation(newConv);
      navigate(`/chat/${newConv.id}`, { replace: true });
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!conversation || isLoading) return;

    // Optimistically add user message
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setConversation(prev => prev ? {
      ...prev,
      messages: [...prev.messages, userMessage]
    } : null);

    setIsLoading(true);

    try {
      const response = await apiService.sendMessage(message, conversation.id);
      
      if (response.response) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.response,
          timestamp: new Date()
        };

        // Update conversation with server response
        if (response.conversation) {
          setConversation(response.conversation);
        } else {
          setConversation(prev => prev ? {
            ...prev,
            messages: [...prev.messages, assistantMessage]
          } : null);
        }

        // Clear save block content after successful message
        setSaveBlockContent('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Add error message
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date()
      };

      setConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, errorMessage]
      } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = (shouldCollapse: boolean) => {
    // Only auto-collapse on desktop (mobile uses manual toggle)
    if (window.innerWidth > 768) {
      setHeaderCollapsed(shouldCollapse);
    }
  };

  const handleSelectConversation = (id: string) => {
    navigate(`/chat/${id}`);
  };

  const handleSaveBlock = (content: string) => {
    if (content.trim()) {
      setSaveBlockContent(content.trim());
      setShowSaveBlock(true);
    }
  };

  if (authLoading) {
    return <div className="auth-container">Loading...</div>;
  }

  if (needsSetup) {
    return <AuthSetup />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="chat-page">
      <Header
        conversationTitle={conversation?.title || 'New Conversation'}
        onNewConversation={createNewConversation}
        onShowConversations={() => setShowConversations(true)}
        isCollapsed={headerCollapsed}
      />
      
      <div className="chat-container">
        <ChatContainer
          messages={conversation?.messages || []}
          isLoading={isLoading}
          onScroll={handleScroll}
        />
        
        <MessageInput
          onSendMessage={handleSendMessage}
          onSaveBlock={handleSaveBlock}
          isLoading={isLoading}
          canSaveBlock={true}
        />
      </div>
      
      <ConversationsModal
        isOpen={showConversations}
        onClose={() => setShowConversations(false)}
        onSelectConversation={handleSelectConversation}
      />
      
      <SaveBlockModal
        isOpen={showSaveBlock}
        onClose={() => setShowSaveBlock(false)}
        initialContent={saveBlockContent}
      />
    </div>
  );
};

export default ChatPage;
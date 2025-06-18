import React, { useRef, useEffect } from 'react';
import { marked } from 'marked';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  onScroll: (shouldCollapse: boolean) => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({ messages, isLoading, onScroll }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleScroll = () => {
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      onScroll(scrollTop > 50);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="messages" 
      onScroll={handleScroll}
    >
      {messages.map((message, index) => (
        <div key={index} className={`message ${message.role}-message`}>
          {message.role === 'assistant' ? (
            <div dangerouslySetInnerHTML={{ __html: marked(message.content) }} />
          ) : (
            message.content
          )}
        </div>
      ))}
      
      {isLoading && (
        <div className="message assistant-message">
          <em>Thinking...</em>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatContainer;
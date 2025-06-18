import React, { useState } from 'react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onSaveBlock: (content: string) => void;
  isLoading: boolean;
  canSaveBlock: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ 
  onSendMessage, 
  onSaveBlock, 
  isLoading, 
  canSaveBlock 
}) => {
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768 || 
                   'ontouchstart' in window || 
                   navigator.maxTouchPoints > 0 ||
                   /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 120; // 3-4 lines max
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  };

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isLoading) return;
    
    onSendMessage(message.trim());
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isMobile) {
        // On mobile, Enter adds a new line, Shift+Enter sends
        if (e.shiftKey) {
          e.preventDefault();
          handleSubmit(e);
        }
        // Let default behavior happen for plain Enter (new line)
      } else {
        // On desktop, Enter sends, Shift+Enter adds new line
        if (!e.shiftKey) {
          e.preventDefault();
          handleSubmit(e);
        }
        // Let default behavior happen for Shift+Enter (new line)
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="input-container">
      <textarea
        ref={textareaRef}
        className="message-input"
        placeholder="Ask something..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        rows={1}
        style={{ 
          resize: 'none',
          minHeight: '40px',
          maxHeight: '120px',
          overflow: message.split('\n').length > 3 ? 'auto' : 'hidden'
        }}
      />
      
      <button
        type="button"
        className="send-btn"
        onClick={() => onSaveBlock(message)}
        disabled={!message.trim()}
        style={{ background: message.trim() ? '#28a745' : '#6c757d' }}
      >
        Save
      </button>
      
      <button
        type="submit"
        className="send-btn"
        disabled={isLoading || !message.trim()}
      >
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
};

export default MessageInput;
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

interface ChatResponse {
  response: string;
  conversation?: Conversation;
}

interface HealthStatus {
  status: string;
  timestamp: string;
  embeddings: boolean;
  blocks: number;
}

interface SearchRequest {
  query: string;
  semantic?: boolean;
  maxResults?: number;
  minScore?: number;
}

interface SearchResult {
  id: string;
  content: string;
  file: string;
  line: number;
  score?: number;
}

interface SearchResponse {
  blocks: SearchResult[];
  searchType: 'text' | 'semantic';
  embeddingsReady: boolean;
}

class ApiService {
  private getAuthHeaders() {
    const token = localStorage.getItem('kernelAuthToken');
    return token ? { 'X-Auth-Token': token } : {};
  }

  async getHealth(): Promise<HealthStatus> {
    const response = await fetch('/api/health', {
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to get health status');
    }
    
    return response.json();
  }

  async sendMessage(message: string, conversationId: string): Promise<ChatResponse> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ message, conversationId })
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    return response.json();
  }

  async createConversation(): Promise<Conversation> {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      }
    });

    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }

    return response.json();
  }

  async getConversations(): Promise<Conversation[]> {
    const response = await fetch('/api/conversations', {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to get conversations');
    }

    return response.json();
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await fetch(`/api/conversations/${id}`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }

    return response.json();
  }

  async saveBlock(content: string, id?: string, filename?: string): Promise<{ success: boolean; blockCount: number }> {
    const response = await fetch('/api/blocks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        content,
        id: id || `block_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        filename
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save block');
    }

    return response.json();
  }

  async searchBlocks(request: SearchRequest): Promise<SearchResponse> {
    const response = await fetch('/api/blocks/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error('Failed to search blocks');
    }

    return response.json();
  }
}

export const apiService = new ApiService();
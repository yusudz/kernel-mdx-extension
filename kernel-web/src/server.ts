import express from 'express';
import cors from 'cors';
import path from 'path';
import { ConfigManager } from './services/storage/ConfigManager';
import { FileStorage } from './services/storage/FileStorage';
import { ClaudeService } from './services/ai/ClaudeService';
import { OpenAiService } from './services/ai/OpenAiService';
import { GeminiService } from './services/ai/GeminiService';
import { PythonServerManager } from './services/PythonServerManager';
import { createAuthMiddleware } from './middleware/auth';
import { BlockParser } from './services/BlockParser';

const app = express();
const PORT = process.env.PORT || 3000;

// Services
const configManager = new ConfigManager();
const fileStorage = new FileStorage();
const blockParser = new BlockParser(fileStorage, configManager);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Auth middleware
const authMiddleware = createAuthMiddleware(configManager);
app.use('/api', authMiddleware);

// Initialize AI services
const getAiService = (provider: 'claude' | 'openai' | 'gemini' = 'claude') => {
  switch (provider) {
    case 'claude': {
      const apiKey = configManager.get('claudeApiKey');
      const model = configManager.get('claudeModel');
      if (!apiKey) throw new Error('Claude API key not configured');
      return new ClaudeService({ apiKey, model });
    }
    case 'openai': {
      const apiKey = configManager.get('openaiApiKey');
      const model = configManager.get('openaiModel');
      if (!apiKey) throw new Error('OpenAI API key not configured');
      return new OpenAiService({ apiKey, model });
    }
    case 'gemini': {
      const apiKey = configManager.get('geminiApiKey');
      const model = configManager.get('geminiModel');
      if (!apiKey) throw new Error('Gemini API key not configured');
      return new GeminiService({ apiKey, model });
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
};

// Initialize embeddings server
const embeddingsServer = new PythonServerManager({
  serverDir: path.join(__dirname, '../embeddings-server'),
  serverScript: path.join(__dirname, '../embeddings-server/server.py'),
  port: 5000,
  maxStartupTime: 30000,
  pythonCommands: ['python3', 'python', 'py'],
  readyWhen: {
    endpoint: {
      path: '/health',
      check: (data: any) => data.status === 'ok'
    }
  }
});

// Check auth status (no auth required)
app.get('/api/auth/status', (req, res) => {
  const authToken = configManager.get('authToken');
  const isDefaultToken = authToken === 'your-secret-token-here';
  
  res.json({ 
    hasToken: !!authToken && !isDefaultToken,
    needsSetup: isDefaultToken,
    message: isDefaultToken ? 'Please change the default authToken in data/config.json' : undefined
  });
});

// Verify token (no auth required - this IS the auth check)
app.post('/api/auth/verify', (req, res) => {
  const { token } = req.body;
  const authToken = configManager.get('authToken');
  const isDefaultToken = authToken === 'your-secret-token-here';
  
  if (isDefaultToken) {
    res.status(401).json({ 
      valid: false, 
      error: 'Please change the default authToken in data/config.json' 
    });
    return;
  }
  
  if (!token) {
    res.status(400).json({ 
      valid: false, 
      error: 'Token is required' 
    });
    return;
  }
  
  const isValid = token === authToken;
  
  if (isValid) {
    res.json({ valid: true, message: 'Token is valid' });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    embeddings: embeddingsServer.isReady(),
    blocks: blockParser.size
  });
});

// Remove config API endpoints - keep config server-side only

app.post('/api/chat', async (req, res) => {
    try {
      const { message, conversationId } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Load existing conversation if ID provided
    let conversation = null;
    if (conversationId) {
      conversation = await fileStorage.loadConversation(conversationId);
    }

    // If no conversation exists, create new one
    if (!conversation && conversationId) {
      conversation = {
        id: conversationId,
        title: message.substring(0, 50),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    // Get conversation history for AI context
    const conversationHistory = conversation ? conversation.messages : [];

    // Build context from relevant blocks
    const relevantBlocks = blockParser.searchBlocks(message);
    const blockContext = relevantBlocks.length > 0 
      ? relevantBlocks.map(block => `[${block.content}] @${block.id}`).join('\n\n')
      : "No relevant blocks found";
    
    const context = `Available knowledge blocks:\n\n${blockContext}`;
    
    // Default to Claude, but could be made configurable
    const aiService = getAiService('claude');
    const response = await aiService.queryWithContext(message, context, conversationHistory);
    
    // Save updated conversation
    if (conversation) {
      conversation.messages.push(
        { role: 'user' as const, content: message, timestamp: new Date() },
        { role: 'assistant' as const, content: response, timestamp: new Date() }
      );
      conversation.updatedAt = new Date();
      
      await fileStorage.saveConversation(conversation);
      
      // Return the full updated conversation
      res.json({ response, conversation });
    } else {
      // No conversation ID provided - just return response
      res.json({ response });
    }
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
});

// Conversation management endpoints
app.post('/api/conversations', async (req, res) => {
  try {
    const conversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const conversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await fileStorage.saveConversation(conversation);
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await fileStorage.listConversations();
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await fileStorage.loadConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const deleted = await fileStorage.deleteConversation(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Block management endpoints
app.get('/api/blocks', (req, res) => {
  try {
    const blocks = blockParser.getAllBlocks();
    res.json(blocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get blocks' });
  }
});

app.get('/api/blocks/:id', (req, res) => {
  try {
    const block = blockParser.getBlock(req.params.id);
    if (!block) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }
    res.json(block);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get block' });
  }
});

app.post('/api/blocks/search', (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }
    
    const blocks = blockParser.searchBlocks(query);
    res.json(blocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search blocks' });
  }
});

app.post('/api/blocks', async (req, res) => {
  try {
    const { id, content, filename } = req.body;
    
    if (!id || !content) {
      res.status(400).json({ error: 'ID and content are required' });
      return;
    }
    
    const filePath = await fileStorage.createBlock(id, content, filename);
    
    // Re-parse the file to update blocks
    await blockParser.parseFile(filePath);
    
    res.json({ success: true, filePath, blockCount: blockParser.size });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create block' });
  }
});

app.post('/api/blocks/parse', async (req, res) => {
  try {
    await blockParser.parseAllFiles();
    res.json({ 
      success: true, 
      message: `Parsed all files, found ${blockParser.size} blocks`
    });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: 'Failed to parse blocks' });
  }
});

// Catch-all handler for client-side routing (must be AFTER all API routes)
app.get('*', (req, res) => {
  // Serve index.html for all non-API routes (client-side routing)
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
async function startServer() {
  try {
    // Parse existing blocks
    console.log('Parsing existing blocks...');
    await blockParser.parseAllFiles();
    console.log(`Found ${blockParser.size} blocks`);
    
    // Start embeddings server
    console.log('Starting embeddings server...');
    await embeddingsServer.start();
    console.log('Embeddings server started successfully');
    
    // Start web server
    app.listen(PORT, () => {
      console.log(`Kernel Web server running on http://localhost:${PORT}`);
      console.log(`Embeddings server: ${embeddingsServer.getBaseUrl()}`);
      console.log(`Blocks loaded: ${blockParser.size}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  embeddingsServer.stop();
  process.exit(0);
});

startServer();
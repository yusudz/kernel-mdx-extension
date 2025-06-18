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
import { EmbeddingsService } from './services/EmbeddingsService';
import { ContextService } from './services/ContextService';
import * as chokidar from 'chokidar';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

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

// Initialize embeddings and context services after server manager
const embeddingsService = new EmbeddingsService(embeddingsServer);
const contextService = new ContextService(embeddingsService, blockParser, configManager, fileStorage);

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
    embeddings: embeddingsService.isReady(),
    embeddingsCache: embeddingsService.getCacheStats(),
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

    // Build context using the sophisticated ContextService
    const context = await contextService.gatherContext({
      query: message,
    });
    
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

app.post('/api/blocks/search', async (req, res) => {
  try {
    const { query, semantic = true, maxResults = 10, minScore = 0.3 } = req.body;
    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }
    
    let blocks;
    let searchType = 'text';
    
    if (semantic && embeddingsService.isReady()) {
      // Use semantic search via EmbeddingsService
      const allBlocks = blockParser.getAllBlocks();
      const blockData = allBlocks.map(block => ({ id: block.id, content: block.content }));
      
      const results = await embeddingsService.findSimilar(query, blockData, maxResults);
      blocks = results
        .filter(result => result.score >= minScore)
        .map(result => allBlocks[result.index]);
      searchType = 'semantic';
    } else {
      // Fallback to text search
      blocks = blockParser.searchBlocks(query).slice(0, maxResults);
    }
    
    res.json({ 
      blocks, 
      searchType,
      embeddingsReady: embeddingsService.isReady(),
      cacheStats: embeddingsService.getCacheStats()
    });
  } catch (error) {
    console.error('Search error:', error);
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

// File watching setup
function setupFileWatching(): void {
  const blocksDir = configManager.get('notesFolder') || './data/blocks';
  const filePattern = configManager.get('filePattern') || '**/*.mdx';
  
  console.log(`Watching ${blocksDir}/${filePattern} for changes...`);
  
  const watcher = chokidar.watch(path.join(blocksDir, filePattern), {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // don't trigger on startup
    usePolling: false,
    interval: 1000,
  });

  let isProcessing = false;
  const debounceTime = 500; // ms
  let debounceTimer: NodeJS.Timeout | null = null;

  const processFileChange = async (filePath: string, event: string) => {
    if (isProcessing) return;
    
    try {
      isProcessing = true;
      console.log(`File ${event}: ${filePath}`);
      
      // Clear embeddings cache for blocks from this file
      const existingBlocks = blockParser.getBlocksFromFile(filePath);
      if (existingBlocks.length > 0) {
        const blockIds = existingBlocks.map(block => block.id);
        embeddingsService.clearMultipleFromCache(blockIds);
        console.log(`Cleared embeddings cache for ${blockIds.length} blocks`);
      }
      
      // Re-parse the specific file
      if (event !== 'unlink') {
        await blockParser.parseFile(filePath);
        console.log(`Re-parsed ${filePath}, total blocks: ${blockParser.size}`);
      } else {
        // File was deleted - blocks are automatically removed by parseFile
        console.log(`File deleted: ${filePath}, total blocks: ${blockParser.size}`);
      }
      
    } catch (error) {
      console.error(`Error processing file change for ${filePath}:`, error);
    } finally {
      isProcessing = false;
    }
  };

  const debouncedProcess = (filePath: string, event: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      processFileChange(filePath, event);
    }, debounceTime);
  };

  watcher
    .on('add', (filePath) => debouncedProcess(filePath, 'added'))
    .on('change', (filePath) => debouncedProcess(filePath, 'changed'))
    .on('unlink', (filePath) => debouncedProcess(filePath, 'unlink'))
    .on('error', (error) => console.error('File watcher error:', error))
    .on('ready', () => console.log('File watcher ready'));

  // Cleanup on server shutdown
  process.on('SIGINT', () => {
    console.log('Closing file watcher...');
    watcher.close();
  });

  process.on('SIGTERM', () => {
    console.log('Closing file watcher...');
    watcher.close();
  });
}

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
    
    // Setup file watching for MDX files
    console.log('Setting up file watching...');
    setupFileWatching();
    
    // Start web server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Kernel Web server running on http://localhost:${PORT}`);
      console.log(`Embeddings server: ${embeddingsServer.getBaseUrl()}`);
      console.log(`Blocks loaded: ${blockParser.size}`);
      console.log('File watching active for .mdx files');
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
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build Client**: `npm run build:client` - Builds React frontend to `/public`
- **Build Server**: `npm run build` - Compiles TypeScript server to `/dist`
- **Watch**: `npm run watch` - Builds server in watch mode for development
- **Start**: `npm start` - Runs the production server
- **Dev**: `npm run dev` - Runs server in development mode

## Architecture Overview

This is a web-first chat application that evolved from a VS Code extension. It provides AI-powered conversations with automatic knowledge management through a log-based file system.

### Core Philosophy: Chat-First

Unlike traditional knowledge management tools, kernel-web is **chat-first**:
- Users focus on conversations, not file management
- Blocks are automatically saved to log files
- Knowledge organizes itself through AI-assisted condensation
- No manual file/folder decisions required

### Technology Stack

**Backend**:
- Node.js/Express with TypeScript
- File-based storage (no database)
- Token-based authentication via config file
- Python embeddings server (sentence-transformers)

**Frontend**:
- React with TypeScript
- Webpack bundling
- Client-side markdown rendering (marked.js)
- Responsive design (mobile-first)

### File Structure

```
kernel-web/
├── src/
│   ├── server.ts              # Main Express server
│   ├── client/                # React frontend
│   │   ├── components/        # UI components
│   │   ├── pages/            # Route components
│   │   └── services/         # API clients
│   ├── services/             # Backend services
│   │   ├── ai/              # AI service implementations
│   │   ├── storage/         # File storage abstractions
│   │   └── *.ts             # Core services
│   └── middleware/          # Express middleware
├── data/                    # Runtime data (git-ignored)
│   ├── log/                # Active log files (1.mdx, 2.mdx, ...)
│   ├── log_organized/      # Condensed/organized logs
│   ├── blocks/             # Legacy individual block files
│   ├── conversations/      # Chat history (.json files)
│   └── config.json         # Server configuration
├── embeddings-server/      # Python embeddings service
└── public/                 # Built frontend assets
```

## Log-Based Knowledge Management

The system uses a novel **log-based approach** for knowledge storage:

### Active Logs (`data/log/`)
- `1.mdx`, `2.mdx`, `3.mdx`, etc.
- New blocks append to the highest-numbered file
- Contains recent, unorganized knowledge blocks
- Full content included in AI context

### Organized Logs (`data/log_organized/`)
- `1_organized.mdx`, `2_organized.mdx`, etc.
- Manually condensed/summarized versions of active logs
- All organized logs auto-included in AI context
- Provides long-term knowledge memory

### Block Format
```markdown
[This is a knowledge block about React hooks] @abc123

[Another block with more content
spanning multiple lines] @xyz789
```

## AI Architecture

### Two-Stage AI Pipeline
1. **Gemini** (optional): Context compression if configured
2. **Claude**: Final response generation

### Context Assembly
AI context includes (in order):
1. Always-include files (e.g., `kernel_instructions.mdx`)
2. Current content and referenced blocks
3. Semantically similar blocks (via embeddings)
4. All organized log files (`log_organized/*.mdx`)
5. Current active log file (`log/N.mdx`)

### Supported AI Providers
- **Claude**: Primary provider for responses
- **Gemini**: Context compression only
- **OpenAI**: Available but not used in main pipeline

## Key Services

### BlockParser (`src/services/BlockParser.ts`)
- Parses all `.mdx` files for `[content] @id` blocks
- Maintains in-memory index: `blockMap` and `fileIndex`
- Supports search across all blocks
- Auto-generates 6-character alphanumeric IDs

### FileStorage (`src/services/storage/FileStorage.ts`)
- Manages log-based file operations
- Auto-detects current active log file
- Handles block appending and file organization
- Abstracts filesystem operations

### ContextService (`src/services/ContextService.ts`)
- Assembles AI context from multiple sources
- Integrates semantic search via embeddings
- Manages log-based context inclusion
- Handles context compression workflow

### EmbeddingsService (`src/services/EmbeddingsService.ts`)
- Manages Python embeddings server lifecycle
- Provides semantic search across blocks
- Caches embeddings for performance
- Uses `all-MiniLM-L6-v2` model

## Configuration

All settings in `data/config.json`:

```json
{
  "authToken": "your-secret-token-here",
  "claudeApiKey": "sk-ant-...",
  "geminiApiKey": "optional-for-compression",
  "openaiApiKey": "optional",
  "notesFolder": "./data/blocks",
  "filePattern": "**/*.mdx",
  "alwaysIncludeFiles": ["kernel_instructions.mdx"]
}
```

**Security**: Only server admin can modify config. No user-facing config endpoints.

## Authentication

- Simple token-based auth via `X-Auth-Token` header
- Token stored in `data/config.json`
- Frontend stores token in localStorage
- No user registration - single-user system

## API Endpoints

### Chat
- `POST /api/chat` - Send message, get AI response
- `GET /api/conversations` - List all conversations
- `GET /api/conversations/:id` - Load specific conversation
- `DELETE /api/conversations/:id` - Delete conversation

### Blocks
- `POST /api/blocks` - Save new block (appends to active log)
- `GET /api/blocks` - List all blocks
- `POST /api/blocks/search` - Semantic/text search
- `POST /api/blocks/parse` - Re-parse all files

### System
- `GET /api/health` - Server status and stats
- `POST /api/auth/verify` - Validate auth token

## Frontend Architecture

### Component Structure
- `ChatPage` - Main chat interface
- `ChatContainer` - Message display with markdown rendering
- `Header` - Navigation and controls
- `SearchModal` - Semantic block search
- `SaveBlockModal` - Block creation interface

### State Management
- React hooks for local state
- AuthContext for authentication
- No global state library (keeping it simple)

### Routing
- React Router for SPA navigation
- `/chat/:conversationId?` - Main chat interface
- Catch-all route serves `index.html` for client-side routing

## Development Workflow

### Adding New Features
1. Server changes: Update services in `src/services/`
2. API changes: Add routes to `src/server.ts`
3. Frontend: Add components in `src/client/components/`
4. Build: `npm run build:client` for frontend changes

### File Management
- Blocks auto-append to `data/log/N.mdx`
- Manual log condensation: copy content to `data/log_organized/N_organized.mdx`
- System auto-includes organized logs in context
- No user file management required

### Testing
- Manual testing via chat interface
- Semantic search via "Search Blocks" button
- Health endpoint: `GET /api/health` for system status

## Migration Notes

**From VS Code Extension**:
- Copy organized knowledge to `data/log_organized/`
- Copy active blocks to `data/log/`
- System will auto-detect and parse everything
- All VS Code extension AI services successfully ported

**Key Differences from Extension**:
- No VS Code decorations/hover/goto-definition
- File watching instead of document change events
- Web-based UI instead of VS Code webviews
- Simplified user experience (chat-first)

## Performance Considerations

- Embeddings cached in memory for speed
- File watching with debouncing (500ms)
- Client-side markdown rendering
- Bundle size: ~274KB (includes marked.js)

## Troubleshooting

### Common Issues
1. **Embeddings server fails**: Run `pip install -r embeddings-server/requirements.txt`
2. **Auth issues**: Check `authToken` in `data/config.json`
3. **No blocks found**: Ensure `.mdx` files use `[content] @id` format
4. **Context too large**: Manually condense active logs to organized logs

### Development Tips
- Use `npm run watch` for server development
- Check browser console for frontend errors
- Monitor server logs for backend issues
- `/api/health` endpoint shows system status

## Important Behaviors

- **Auto ID Generation**: Empty ID field generates 6-char alphanumeric ID
- **Collision Detection**: Server prevents duplicate block IDs
- **Context Assembly**: Always includes organized logs + current active log
- **Markdown Rendering**: All assistant messages rendered as markdown
- **Responsive Design**: Mobile-optimized with collapsible header
- **File Watching**: Auto-detects changes to `.mdx` files
- **Semantic Search**: Powered by sentence-transformers embeddings
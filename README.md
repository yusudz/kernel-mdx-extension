# Kernel MDX Extension

A Visual Studio Code extension that transforms MDX files into a personal knowledge graph system with semantic search, AI-powered chat, and intelligent block management.

## Features

### 🧠 Knowledge Blocks
- Create reusable knowledge blocks with `[content] @id` syntax
- Auto-generate unique IDs for new blocks
- Visual highlighting for block IDs and orphaned references
- Hover over `@id` references to preview block content
- `Ctrl+Click` to jump to block definitions

### 🔍 Semantic Search
- AI-powered semantic search across all your blocks
- Find related content based on meaning, not just keywords
- Powered by local embeddings server (sentence-transformers)

### 💬 AI Chat Interface
- Chat with Claude about your notes and knowledge blocks
- Automatically gathers relevant context from your workspace
- Maintains conversation history
- Debug mode to see exactly what's sent to the AI

### 📁 Smart File Management
- Automatically parses all MDX files in your notes folder
- Real-time block tracking as you type
- Cross-file block references
- Configurable notes folder and file patterns

### ✨ Editor Enhancements
- Syntax highlighting for MDX with Kernel additions
- Smart bracket folding for better organization
- Auto-completion for block creation and references
- Decorations for valid/orphaned block references

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd kernel-mdx-extension
   ```

2. Install VS Code extension dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Set up the embeddings server (for semantic search):
   ```bash
   cd embeddings-server
   pip install -r requirements.txt
   ```

5. Open the project in VS Code and press `F5` to run the extension

## Usage

### Creating Knowledge Blocks
```mdx
[This is a reusable piece of knowledge] @myblock

Later reference it with @myblock
```

### Commands
- **Kernel: Search Blocks** (`Ctrl+Shift+F`) - Semantic search across all blocks
- **Kernel: Open Chat** - Chat with Claude about your notes
- **Kernel: Add Block ID** (`Ctrl+Shift+I`) - Add ID to current bracket block
- **Kernel: Parse All Notes** - Manually parse all MDX files
- **Kernel: Copy Current Context** - Copy AI context to clipboard
- **Kernel: Flush Block Cache** - Clear and rebuild block index

### Configuration
Set these in VS Code settings:
- `kernel.notesFolder` - Folder containing your MDX files (default: "notes")
- `kernel.filePattern` - Pattern for MDX files (default: "**/*.mdx")
- `kernel.claudeApiKey` - Your Claude API key for chat functionality
- `kernel.preferredModel` - Claude model preference
- `kernel.alwaysIncludeFiles` - Files to always include in AI context

## Architecture

The extension consists of:
- **TypeScript Extension** - Core VS Code functionality
- **Python Embeddings Server** - Local semantic search service
- **Block Manager** - Tracks all knowledge blocks across files
- **Chat Interface** - WebView-based AI chat

## Requirements

- VS Code 1.60.0 or higher
- Python 3.7+ (for embeddings server)
- Claude API key (for chat functionality)

## License

All rights reserved. This is proprietary software.
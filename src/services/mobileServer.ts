import * as express from 'express';
import * as cors from 'cors';
import { ChatWebview } from '../webviews/chatWebview';
import { ContextService } from './contextService';
import { BaseAiService } from './baseAiService';
import { ConversationMessage } from '../types';
import { marked } from 'marked';

export class MobileServer {
  private app: express.Application;
  private server?: any;
  private conversationHistory: ConversationMessage[] = [];

  constructor(
    private aiService: BaseAiService,
    private contextService: ContextService,
    private port: number = 3000
  ) {
    this.app = express.default();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors.default());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Serve the chat interface - reuse existing HTML!
    this.app.get('/', (req, res) => {
      const html = this.getMobileHtml();
      res.send(html);
    });

    // Chat endpoint
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message } = req.body;
        
        // Add user message to history
        this.conversationHistory.push({ role: 'user', content: message });

        // Gather context - reuse existing service
        let context = await this.contextService.gatherContext({
          query: message,
        });

        // Compress context
        context = await this.contextService.compressContext(
          context,
          message,
          this.conversationHistory
        );

        // Get AI response - reuse existing service
        const response = await this.aiService.queryWithContext(
          message,
          context,
          this.conversationHistory
        );

        // Add to history
        this.conversationHistory.push({ role: 'assistant', content: response });

        // Convert markdown to HTML for rendering
        const htmlResponse = marked(response);

        res.json({ 
          response,
          html: htmlResponse
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Clear history endpoint
    this.app.post('/api/clear', (req, res) => {
      this.conversationHistory = [];
      res.json({ success: true });
    });
  }

  private getMobileHtml(): string {
    // Start with the existing ChatWebview HTML
    const baseHtml = ChatWebview.getHtml({ 
      model: this.aiService.constructor.name 
    });

    // Modify it for mobile/web use
    return baseHtml
      // Replace VSCode API with fetch calls
      .replace('const vscode = acquireVsCodeApi();', `
        const vscode = {
          postMessage: async (message) => {
            if (message.command === 'sendMessage') {
              try {
                const response = await fetch('/api/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message: message.text })
                });
                const data = await response.json();
                
                // Simulate VSCode message
                window.postMessage({
                  command: 'response',
                  text: data.response,
                  html: data.html
                }, '*');
              } catch (error) {
                window.postMessage({
                  command: 'error',
                  text: error.message
                }, '*');
              }
            } else if (message.command === 'clearHistory') {
              await fetch('/api/clear', { method: 'POST' });
              window.postMessage({ command: 'historyCleared' }, '*');
            }
          }
        };
      `)
      // Add mobile viewport
      .replace('<head>', `<head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`)
      // Replace VSCode CSS variables with defaults
      .replace(/var\(--vscode-[^)]+\)/g, (match) => {
        const cssVarMap: Record<string, string> = {
          'var(--vscode-font-family)': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          'var(--vscode-panel-border)': '#e1e4e8',
          'var(--vscode-editor-selectionBackground)': '#e3f2fd',
          'var(--vscode-editor-inactiveSelectionBackground)': '#f5f5f5',
          'var(--vscode-textCodeBlock-background)': '#f6f8fa',
          'var(--vscode-input-background)': '#ffffff',
          'var(--vscode-input-foreground)': '#24292e',
          'var(--vscode-input-border)': '#e1e4e8',
          'var(--vscode-button-background)': '#0366d6',
          'var(--vscode-button-foreground)': '#ffffff',
          'var(--vscode-button-secondaryBackground)': '#6c757d',
          'var(--vscode-inputValidation-errorBackground)': '#dc3545',
        };
        return cssVarMap[match] || '#000000';
      })
      // Remove debug button for mobile
      .replace('<button class="debug-button" onclick="debugPrompt()">Debug</button>', '');
  }

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        const url = `http://0.0.0.0:${this.port}`;
        console.log(`Mobile server running at ${url}`);
        resolve(url);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}
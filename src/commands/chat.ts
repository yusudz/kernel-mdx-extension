import * as vscode from "vscode";
import * as path from "path";
import { blockManager } from "../blockManager";
import { ConversationMessage } from "../types";
import { EmbeddingsClient } from "../embeddings";

export async function openChatCommand(embeddingsClient?: EmbeddingsClient): Promise<void> {
  const config = vscode.workspace.getConfiguration("kernel");
  const preferredModel = config.get<string>(
    "preferredModel",
    "claude-4-sonnet-20250514"
  );

  const panel = vscode.window.createWebviewPanel(
    "kernelChat",
    "Kernel Chat",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const conversationHistory: ConversationMessage[] = [];
  let context = await gatherContext(vscode.window.activeTextEditor);

  panel.webview.html = getChatWebviewContent(
    panel.webview,
    context,
    preferredModel
  );

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "sendMessage":
        const userMessage = message.text;
        conversationHistory.push({ role: "user", content: userMessage });
        
        // Re-gather context with semantic search based on the user's message
        context = await gatherContext(vscode.window.activeTextEditor, embeddingsClient, userMessage);
        
        try {
          const response = await queryClaudeWithContext(
            userMessage,
            context,
            conversationHistory
          );
          conversationHistory.push({ role: "assistant", content: response });

          const md = new vscode.MarkdownString(response);
          md.isTrusted = true;
          const html = await vscode.commands.executeCommand(
            "markdown.api.render",
            md.value
          );

          panel.webview.postMessage({
            command: "response",
            text: response,
            html: html,
          });
        } catch (error: any) {
          panel.webview.postMessage({
            command: "error",
            text: error.message,
          });
        }
        break;
      case "clearHistory":
        conversationHistory.length = 0;
        panel.webview.postMessage({ command: "historyCleared" });
        break;
      case "debugPrompt":
        // Build the actual prompt that would be sent
        const debugQuery = message.text;
        
        // Re-gather context with semantic search based on the debug query - exactly like sendMessage
        const debugContext = await gatherContext(vscode.window.activeTextEditor, embeddingsClient, debugQuery);
        
        const { system, messages } = buildClaudePrompt(
          debugQuery,
          debugContext,
          conversationHistory
        );
        
        const debugText = formatDebugPrompt(system, messages);
        await vscode.env.clipboard.writeText(debugText);
        vscode.window.showInformationMessage(
          "Debug prompt copied to clipboard!"
        );
        break;
    }
  });
}

export async function gatherContext(
  editor?: vscode.TextEditor,
  embeddingsClient?: EmbeddingsClient,
  query?: string
): Promise<string> {
  const contextParts: string[] = [];
  const config = vscode.workspace.getConfiguration("kernel");
  const includedBlockIds = new Set<string>();

  // 1. Always include specified files
  const alwaysInclude = config.get<string[]>("alwaysIncludeFiles", [
    "kernel_instructions.mdx",
  ]);

  for (const filename of alwaysInclude) {
    try {
      const files = await vscode.workspace.findFiles(`**/${filename}`);
      if (files.length > 0) {
        const doc = await vscode.workspace.openTextDocument(files[0]);
        contextParts.push(`// ${filename}\n${doc.getText()}`);
      }
    } catch (error) {
      console.error(`Failed to include ${filename}:`, error);
    }
  }

  // 2. Current file content
  if (editor) {
    const fileName = path.basename(editor.document.fileName);
    contextParts.push(
      `\n// Current file: ${fileName}\n${editor.document.getText()}`
    );

    // 3. Get referenced blocks from current file
    const text = editor.document.getText();
    const refRegex = /(?<!\]\s*)@([a-zA-Z0-9_]+)\b/g;
    let match;

    while ((match = refRegex.exec(text)) !== null) {
      const id = match[1];
      if (!includedBlockIds.has(id) && blockManager.has(id)) {
        const block = blockManager.get(id)!;
        includedBlockIds.add(id);
        contextParts.push(`\n// Referenced block @${id}\n${block.content}`);
      }
    }
  }

  // 4. Semantic search for relevant blocks (if embeddings available and query provided)
  if (embeddingsClient && query && query.trim() !== "") { // Check for non-empty trimmed query
    try {
      // Get all blocks not already included
      const allBlocks = Array.from(blockManager.entries())
        .filter(([id]) => !includedBlockIds.has(id))
        .map(([id, block]) => ({
          id,
          content: block.content,
        }));

      if (allBlocks.length > 0) {
        const results = await embeddingsClient.findSimilar(
          query,
          allBlocks.map(b => b.content),
          10 // Top 10 semantically similar blocks
        );

        contextParts.push("\n// Semantically related blocks");
        for (const result of results) {
          const block = allBlocks[result.index];
          contextParts.push(`\n// Related block @${block.id} (score: ${result.score.toFixed(3)})\n${block.content}`);
          includedBlockIds.add(block.id);
        }
      }
    } catch (error) {
      console.error("Semantic search failed:", error);
      // Continue without semantic search if it fails
    }
  }

  // 5. Recent blocks (excluding already included ones)
  const recentBlocks = Array.from(blockManager.entries())
    .filter(([id]) => !includedBlockIds.has(id))
    .slice(-10)
    .map(([id, block]) => `@${id}: ${block.content}`)
    .join("\n\n");

  if (recentBlocks) {
    contextParts.push(`\n// Recent blocks\n${recentBlocks}`);
  }

  return contextParts.join("\n\n---\n\n");
}

function getChatWebviewContent(
  webview: vscode.Webview,
  initialContext: string,
  model: string = ""
): string {
  return `<!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: var(--vscode-font-family); 
                    padding: 20px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                #chat-container {
                    height: 70vh;
                    overflow-y: auto;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 10px;
                    margin-bottom: 10px;
                }
                #model-info {
                    font-size: 0.95em;
                    color: var(--vscode-descriptionForeground, #888);
                    margin-bottom: 10px;
                }
                .message {
                    margin: 10px 0;
                    padding: 10px;
                    border-radius: 5px;
                }
                .user { background: var(--vscode-editor-selectionBackground); }
                .assistant { background: var(--vscode-editor-inactiveSelectionBackground); }
                .message pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 10px;
                    border-radius: 3px;
                    overflow-x: auto;
                }
                .message code {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                }
                .message ul, .message ol {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                .message blockquote {
                    border-left: 3px solid var(--vscode-textBlockQuote-border);
                    padding-left: 10px;
                    margin: 10px 0;
                    color: var(--vscode-textBlockQuote-foreground);
                }
                #input-container {
                    display: flex;
                    gap: 10px;
                }
                #message-input {
                    flex: 1;
                    padding: 10px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                button {
                    padding: 10px 20px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                button:hover {
                    opacity: 0.8;
                }
                .debug-button {
                    background: var(--vscode-button-secondaryBackground);
                }
                .clear-button {
                    background: var(--vscode-inputValidation-errorBackground);
                }
            </style>
        </head>
        <body>
            <h2>Kernel Chat</h2>
            <div id="model-info">Claude Model: <b>${model}</b></div>
            <div id="chat-container"></div>
            <div id="input-container">
                <textarea id="message-input" rows="3" placeholder="Ask about your notes..." 
    onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }"></textarea>
                <button onclick="sendMessage()">Send</button>
                <button class="debug-button" onclick="debugPrompt()">Debug</button>
                <button class="clear-button" onclick="clearHistory()">Clear</button>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function sendMessage() {
                    const input = document.getElementById('message-input');
                    const message = input.value.trim();
                    if (!message) return;
                    
                    // Add user message to chat
                    addMessage(message, 'user');
                    
                    // Send to extension
                    vscode.postMessage({ command: 'sendMessage', text: message });
                    
                    input.value = '';
                }
                
                function addMessage(text, type, html = null) {
                    const container = document.getElementById('chat-container');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message ' + type;
                    
                    if (html && type === 'assistant') {
                        messageDiv.innerHTML = html;
                    } else {
                        messageDiv.textContent = text;
                    }
                    
                    container.appendChild(messageDiv);
                    container.scrollTop = container.scrollHeight;
                }
                
                function debugPrompt() {
                    const input = document.getElementById('message-input');
                    const message = input.value.trim() || '(empty message)';
                    vscode.postMessage({ command: 'debugPrompt', text: message });
                }
                
                function clearHistory() {
                    //if (confirm('Clear conversation history?')) {
                        const container = document.getElementById('chat-container');
                        container.innerHTML = '';
                        vscode.postMessage({ command: 'clearHistory' });
                    //}
                }
                
                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'response':
                            addMessage(message.text, 'assistant', message.html);
                            break;
                        case 'historyCleared':
                            console.log('History cleared');
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
}

function buildClaudePrompt(
  query: string,
  context: string,
  history: ConversationMessage[] = []
): { system: string; messages: any[] } {
  const system = "You are Kernel, an AI assistant with access to the user's personal knowledge graph. Answer based on the provided context.";
  const messages: any[] = [];

  messages.push({
    role: "user",
    content: `Here is my current context:\n\n${context}\n\n---\n\nI'll now ask questions about this context.`,
  });

  history.forEach((msg) => {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  });

  if (history.length === 0 || history[history.length - 1].content !== query) {
    messages.push({
      role: "user",
      content: query,
    });
  }

  return { system, messages };
}

function formatDebugPrompt(system: string, messages: any[]): string {
  let debugText = `=== DEBUG PROMPT ===\n\n`;
  debugText += `SYSTEM: ${system}\n\n`;
  debugText += `=== MESSAGES ===\n`;
  
  messages.forEach((msg, index) => {
    debugText += `[${index + 1}] ${msg.role.toUpperCase()}: ${msg.content}\n\n`;
  });
  
  return debugText;
}

async function queryClaudeWithContext(
  query: string,
  context: string,
  history: ConversationMessage[] = []
): Promise<string> {
  const config = vscode.workspace.getConfiguration("kernel");
  const apiKey = config.get<string>("claudeApiKey");
  const preferredModel = config.get<string>(
    "preferredModel",
    "claude-4-sonnet-20250514"
  );

  if (!apiKey) {
    throw new Error("Please set your Claude API key in settings: Kernel > Claude API Key");
  }

  try {
    const { system, messages } = buildClaudePrompt(query, context, history);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: preferredModel,
        max_tokens: 4000,
        messages: messages,
        system: system,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error: any) {
    throw error;
  }
}

export interface ChatWebviewOptions {
  model: string;
  initialContext?: string;
}

export class ChatWebview {
  static getHtml(options: ChatWebviewOptions): string {
    const { model = "" } = options;
    
    return `<!DOCTYPE html>
        <html>
        <head>
            ${this.getStyles()}
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
            
            ${this.getScript()}
        </body>
        </html>`;
  }

  private static getStyles(): string {
    return `<style>
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
            </style>`;
  }

  private static getScript(): string {
    return `<script>
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
                    const container = document.getElementById('chat-container');
                    container.innerHTML = '';
                    vscode.postMessage({ command: 'clearHistory' });
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
                        case 'error':
                            addMessage('Error: ' + message.text, 'assistant');
                            break;
                    }
                });
            </script>`;
  }
}
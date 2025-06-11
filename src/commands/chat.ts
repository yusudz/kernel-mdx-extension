import * as vscode from "vscode";
import { ConversationMessage } from "../types";
import { EmbeddingsService } from "../services/embeddingsService";
import { BaseAiService } from "../services/baseAiService";
import { ClaudeService } from "../services/claudeService";
import { ContextService } from "../services/contextService";
import { ChatWebview } from "../webviews/chatWebview";
import { DEFAULT_CONFIG } from "../constants";

export async function openChatCommand(embeddingsService: EmbeddingsService): Promise<void> {
  const config = vscode.workspace.getConfiguration("kernel");
  const apiKey = config.get<string>("claudeApiKey", "");
  const claudeModel = config.get<string>("claudeModel", DEFAULT_CONFIG.CLAUDE_MODEL);

  // For now, hardcode to use Claude
  const aiService: BaseAiService = new ClaudeService({
    apiKey,
    model: claudeModel,
  });

  const contextService = new ContextService(embeddingsService);

  // Show a warning if embeddings aren't ready yet
  if (!embeddingsService.isReady()) {
    vscode.window.showWarningMessage(
      "Embeddings service is still starting. Semantic search will not be available in this chat session."
    );
  }

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

  panel.webview.html = ChatWebview.getHtml({
    model: claudeModel
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "sendMessage":
        await handleSendMessage(
          message.text,
          panel,
          aiService,
          contextService,
          conversationHistory
        );
        break;
        
      case "clearHistory":
        conversationHistory.length = 0;
        panel.webview.postMessage({ command: "historyCleared" });
        break;
        
      case "debugPrompt":
        await handleDebugPrompt(
          message.text,
          aiService,
          contextService,
          conversationHistory
        );
        break;
    }
  });
}

async function handleSendMessage(
  userMessage: string,
  panel: vscode.WebviewPanel,
  aiService: BaseAiService,
  contextService: ContextService,
  conversationHistory: ConversationMessage[]
): Promise<void> {
  
  // Gather context with semantic search based on the user's message
  let context = await contextService.gatherContext({
    editor: vscode.window.activeTextEditor,
    query: userMessage,
  });
  
  // Compress context with awareness of conversation history
  context = await contextService.compressContext(
    context, 
    userMessage, 
    conversationHistory
  );
  
  try {
    const response = await aiService.queryWithContext(
      userMessage,
      context,
      conversationHistory  // This now contains only previous messages
    );
    
    // NOW add both the user message and response to history
    conversationHistory.push({ role: "user", content: userMessage });
    conversationHistory.push({ role: "assistant", content: response });

    const md = new vscode.MarkdownString(response);
    md.isTrusted = true;
    const html = await vscode.commands.executeCommand<string>(
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
}

async function handleDebugPrompt(
  debugQuery: string,
  aiService: BaseAiService,
  contextService: ContextService,
  conversationHistory: ConversationMessage[]
): Promise<void> {
  // Gather context with semantic search based on the debug query
  const debugContext = await contextService.gatherContext({
    editor: vscode.window.activeTextEditor,
    query: debugQuery,
  });
  
  const { system, messages } = aiService.buildPrompt(
    debugQuery,
    debugContext,
    conversationHistory
  );
  
  const debugText = aiService.formatDebugPrompt(system, messages);
  await vscode.env.clipboard.writeText(debugText);
  vscode.window.showInformationMessage("Debug prompt copied to clipboard!");
}
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
  const preferredModel = config.get<string>("preferredModel", DEFAULT_CONFIG.PREFERRED_MODEL);

  // For now, hardcode to use Claude
  const aiService: BaseAiService = new ClaudeService({
    apiKey,
    model: preferredModel,
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
  let context = await contextService.gatherContext({
    editor: vscode.window.activeTextEditor,
  });

  panel.webview.html = ChatWebview.getHtml({
    model: preferredModel,
    initialContext: context,
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
  aiService: BaseAiService,  // Changed from ClaudeService
  contextService: ContextService,
  conversationHistory: ConversationMessage[]
): Promise<void> {
  conversationHistory.push({ role: "user", content: userMessage });
  
  // Re-gather context with semantic search based on the user's message
  const context = await contextService.gatherContext({
    editor: vscode.window.activeTextEditor,
    query: userMessage,
  });
  
  try {
    const response = await aiService.query(
      userMessage,
      context,
      conversationHistory
    );
    
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
  // Re-gather context with semantic search based on the debug query
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
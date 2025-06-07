import * as vscode from "vscode";
import { ConversationMessage } from "../types";
import { EmbeddingsClient } from "../embeddings";
import { ClaudeService } from "../services/claudeService";
import { ContextService } from "../services/contextService";
import { ChatWebview } from "../webviews/chatWebview";

export async function openChatCommand(embeddingsClient?: EmbeddingsClient): Promise<void> {
  const config = vscode.workspace.getConfiguration("kernel");
  const apiKey = config.get<string>("claudeApiKey", "");
  const preferredModel = config.get<string>("preferredModel", "claude-4-sonnet-20250514");

  const claudeService = new ClaudeService({
    apiKey,
    model: preferredModel,
  });

  const contextService = new ContextService();

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
          claudeService,
          contextService,
          conversationHistory,
          embeddingsClient
        );
        break;
        
      case "clearHistory":
        conversationHistory.length = 0;
        panel.webview.postMessage({ command: "historyCleared" });
        break;
        
      case "debugPrompt":
        await handleDebugPrompt(
          message.text,
          claudeService,
          contextService,
          conversationHistory,
          embeddingsClient
        );
        break;
    }
  });
}

async function handleSendMessage(
  userMessage: string,
  panel: vscode.WebviewPanel,
  claudeService: ClaudeService,
  contextService: ContextService,
  conversationHistory: ConversationMessage[],
  embeddingsClient?: EmbeddingsClient
): Promise<void> {
  conversationHistory.push({ role: "user", content: userMessage });
  
  // Re-gather context with semantic search based on the user's message
  const context = await contextService.gatherContext({
    editor: vscode.window.activeTextEditor,
    embeddingsClient,
    query: userMessage,
  });
  
  try {
    const response = await claudeService.query(
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
  claudeService: ClaudeService,
  contextService: ContextService,
  conversationHistory: ConversationMessage[],
  embeddingsClient?: EmbeddingsClient
): Promise<void> {
  // Re-gather context with semantic search based on the debug query
  const debugContext = await contextService.gatherContext({
    editor: vscode.window.activeTextEditor,
    embeddingsClient,
    query: debugQuery,
  });
  
  const { system, messages } = claudeService.buildPrompt(
    debugQuery,
    debugContext,
    conversationHistory
  );
  
  const debugText = claudeService.formatDebugPrompt(system, messages);
  await vscode.env.clipboard.writeText(debugText);
  vscode.window.showInformationMessage("Debug prompt copied to clipboard!");
}
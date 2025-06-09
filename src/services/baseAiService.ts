import { ConversationMessage } from "../types";

export interface AiMessage {
  role: string;
  content: string;
}

export interface AiPrompt {
  system: string;
  messages: AiMessage[];
}

export abstract class BaseAiService {
  buildPrompt(
    query: string,
    context: string,
    history: ConversationMessage[] = []
  ): AiPrompt {
    const system = 
      "You are Kernel, an AI assistant with access to the user's personal knowledge graph. " +
      "Answer based on the provided context.";
    
    const messages: AiMessage[] = [];

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

  formatDebugPrompt(system: string, messages: AiMessage[]): string {
    let debugText = `=== DEBUG PROMPT ===\n\n`;
    debugText += `SYSTEM: ${system}\n\n`;
    debugText += `=== MESSAGES ===\n`;
    
    messages.forEach((msg, index) => {
      debugText += `[${index + 1}] ${msg.role.toUpperCase()}: ${msg.content}\n\n`;
    });
    
    return debugText;
  }

  abstract query(
    query: string,
    context: string,
    history: ConversationMessage[]
  ): Promise<string>;
}
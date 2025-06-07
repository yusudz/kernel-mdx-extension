import * as vscode from "vscode";
import { ConversationMessage } from "../types";

export interface ClaudeApiConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  anthropicVersion?: string;
}

export interface ClaudeMessage {
  role: string;
  content: string;
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system: string;
}

export interface ClaudeResponse {
  content: Array<{
    text: string;
    type: string;
  }>;
  id: string;
  model: string;
  role: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "ClaudeApiError";
  }
}

export class ClaudeService {
  private readonly apiUrl = "https://api.anthropic.com/v1/messages";
  
  constructor(private config: ClaudeApiConfig) {}

  async query(
    query: string,
    context: string,
    history: ConversationMessage[] = []
  ): Promise<string> {
    if (!this.config.apiKey) {
      throw new ClaudeApiError(
        "Please set your Claude API key in settings: Kernel > Claude API Key"
      );
    }

    const { system, messages } = this.buildPrompt(query, context, history);

    try {
      const response = await this.makeApiRequest({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 4000,
        messages,
        system,
      });

      return response.content[0].text;
    } catch (error: any) {
      if (error instanceof ClaudeApiError) {
        throw error;
      }
      throw new ClaudeApiError(`Claude API error: ${error.message}`);
    }
  }

  buildPrompt(
    query: string,
    context: string,
    history: ConversationMessage[] = []
  ): { system: string; messages: ClaudeMessage[] } {
    const system = 
      "You are Kernel, an AI assistant with access to the user's personal knowledge graph. " +
      "Answer based on the provided context.";
    
    const messages: ClaudeMessage[] = [];

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

  formatDebugPrompt(system: string, messages: ClaudeMessage[]): string {
    let debugText = `=== DEBUG PROMPT ===\n\n`;
    debugText += `SYSTEM: ${system}\n\n`;
    debugText += `=== MESSAGES ===\n`;
    
    messages.forEach((msg, index) => {
      debugText += `[${index + 1}] ${msg.role.toUpperCase()}: ${msg.content}\n\n`;
    });
    
    return debugText;
  }

  private async makeApiRequest(request: ClaudeRequest): Promise<ClaudeResponse> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": this.config.anthropicVersion || "2023-06-01",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new ClaudeApiError(
        `Claude API error: ${errorBody}`,
        response.status,
        errorBody
      );
    }

    return response.json();
  }

  updateConfig(config: Partial<ClaudeApiConfig>): void {
    Object.assign(this.config, config);
  }
}
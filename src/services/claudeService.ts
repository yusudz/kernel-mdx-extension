import { ConversationMessage } from "../types";
import { AiPrompt, BaseAiService } from "./baseAiService";

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

export class ClaudeService extends BaseAiService {
  private readonly apiUrl = "https://api.anthropic.com/v1/messages";
  
  constructor(private config: ClaudeApiConfig) {
    super();
  }

  async query(prompt: AiPrompt): Promise<string> {
    if (!this.config.apiKey) {
      throw new ClaudeApiError(
        "Please set your Claude API key in settings: Kernel > Claude API Key"
      );
    }

    try {
      const response = await this.makeApiRequest({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 4000,
        messages: prompt.messages,
        system: prompt.system,
      });

      return response.content[0].text;
    } catch (error: any) {
      if (error instanceof ClaudeApiError) {
        throw error;
      }
      throw new ClaudeApiError(`Claude API error: ${error.message}`);
    }
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
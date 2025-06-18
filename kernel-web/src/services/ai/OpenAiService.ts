import { AiPrompt, BaseAiService } from './BaseAiService';

export interface OpenAiConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

interface OpenAiRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

interface OpenAiResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "OpenAiError";
  }
}

export class OpenAiService extends BaseAiService {
  private readonly apiUrl = "https://api.openai.com/v1/chat/completions";

  constructor(private config: OpenAiConfig) {
    super();
  }

  async query(prompt: AiPrompt): Promise<string> {
    if (!this.config.apiKey) {
      throw new OpenAiError(
        "Please set your OpenAI API key in configuration"
      );
    }

    try {
      const response = await this.makeApiRequest({
        model: this.config.model,
        messages: [
          { role: "system", content: prompt.system },
          ...prompt.messages
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      return response.choices[0].message.content;
    } catch (error: any) {
      if (error instanceof OpenAiError) {
        throw error;
      }
      throw new OpenAiError(`OpenAI API error: ${error.message}`);
    }
  }

  private async makeApiRequest(request: OpenAiRequest): Promise<OpenAiResponse> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new OpenAiError(
        `OpenAI API error: ${errorBody}`,
        response.status,
        errorBody
      );
    }

    return response.json();
  }

  updateConfig(config: Partial<OpenAiConfig>): void {
    Object.assign(this.config, config);
  }
}
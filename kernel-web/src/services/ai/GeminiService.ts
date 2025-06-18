import { AiPrompt, BaseAiService } from './BaseAiService';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
}

interface GeminiRequest {
  contents: Array<{
    role: string;
    parts: Array<{
      text: string;
    }>;
  }>;
  systemInstruction?: {
    parts: Array<{
      text: string;
    }>;
  };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export class GeminiService extends BaseAiService {
  private readonly apiUrl: string;

  constructor(private config: GeminiConfig) {
    super();
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
  }

  async query(prompt: AiPrompt): Promise<string> {
    if (!this.config.apiKey) {
      throw new GeminiError(
        "Please set your Gemini API key in configuration"
      );
    }

    try {
      const response = await this.makeApiRequest({
        contents: prompt.messages.map(msg => ({
          role: this.mapRole(msg.role),
          parts: [{ text: msg.content }]
        })),
        systemInstruction: {
          parts: [{ text: prompt.system }]
        },
        generationConfig: {
          maxOutputTokens: this.config.maxOutputTokens,
          temperature: this.config.temperature,
        }
      });

      if (!response.candidates || response.candidates.length === 0) {
        throw new GeminiError("No response generated");
      }

      return response.candidates[0].content.parts[0].text;
    } catch (error: any) {
      if (error instanceof GeminiError) {
        throw error;
      }
      throw new GeminiError(`Gemini API error: ${error.message}`);
    }
  }

  private mapRole(role: string): string {
    // Gemini uses 'model' instead of 'assistant'
    return role === 'assistant' ? 'model' : role;
  }

  private async makeApiRequest(request: GeminiRequest): Promise<GeminiResponse> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new GeminiError(
        `Gemini API error: ${errorBody}`,
        response.status,
        errorBody
      );
    }

    return response.json();
  }

  updateConfig(config: Partial<GeminiConfig>): void {
    Object.assign(this.config, config);
  }
}
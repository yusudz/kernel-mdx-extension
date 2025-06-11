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

    // Add conversation history (without context)
    history.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Add current query with its specific context
    const queryWithContext = `Context:\n${context}\n\nQuery: ${query}`;
    
    messages.push({
      role: "user",
      content: queryWithContext,
    });

    return { system, messages };
  }

  buildCompressionPrompt(
    context: string,
    query: string,
    history: ConversationMessage[] = []
  ): AiPrompt {
    const system = 
      "You are part of Kernel, an AI assistant with access to the user's personal knowledge graph that answers based on the provided context. " +
      "You specifically are part of the CONTEXT SEARCH, EXTRACTION, AND SUMMARIZATION pipeline - your task is to COLLECT information from the context that seems potentially relevant to the query. " +
      "Better to be safe than sorry and produce too much context. This output will then be passed to a more powerful model as context to produce the final response. " +
      "COPY VERBATIM PARTICULARLY RELEVANT SECTIONS. MAXIMUM CONTEXT." + 
      "Extract and compress existing data only. Do not analyze, interpret, or add insights. " +
      "Preserve timeline, emotional states, and connecting patterns. " +
      "Goal: Smaller context that retains all causal information. Godspeed."

    const messages: AiMessage[] = [];

    // Add conversation history to understand context better
    history.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Add the extraction request
    const extractionRequest = `Current query: "${query}"

Context to search and extract from:
${context}

REMINDER OF PROMPT: ${system}`;
    
    messages.push({
      role: "user",
      content: extractionRequest,
    });

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

  // Single abstract method that takes a prompt
  abstract query(prompt: AiPrompt): Promise<string>;
  
  // Convenience method for regular queries
  async queryWithContext(
    query: string,
    context: string,
    history: ConversationMessage[] = []
  ): Promise<string> {
    const prompt = this.buildPrompt(query, context, history);
    return this.query(prompt);
  }
  
  // Convenience method for compression
  async compressContext(
    context: string,
    query: string,
    history: ConversationMessage[] = []
  ): Promise<string> {
    const prompt = this.buildCompressionPrompt(context, query, history);
    return this.query(prompt);
  }
}
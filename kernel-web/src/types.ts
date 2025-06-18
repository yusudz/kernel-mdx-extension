// Web-compatible types (no VS Code dependencies)

export interface Block {
  content: string;
  file: string;
  line: number;
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BlockSearchResult {
  id: string;
  content: string;
  file: string;
  line: number;
  score?: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Config {
  notesFolder: string;
  filePattern: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  claudeModel: string;
  openaiModel: string;
  geminiModel: string;
  alwaysIncludeFiles: string[];
  authToken?: string;
}
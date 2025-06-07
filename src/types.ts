import * as vscode from 'vscode';

export interface Block {
  content: string;
  file: vscode.Uri;
  line: number;
  range: vscode.Range;
}

export interface BlockSearchResult {
  id: string;
  content: string;
  file: string;
  line: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}
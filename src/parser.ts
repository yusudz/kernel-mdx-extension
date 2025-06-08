import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { blockManager } from './blockManager';
import { updateDecorations } from './decorations';
import { REGEX_PATTERNS, DEFAULT_CONFIG } from './constants';
import { ConfigurationError } from './errors';
import { Block } from './types';

export class DocumentParser {
  parseDocument(document: vscode.TextDocument): void {
    const text = document.getText();
    const matches = this.findBlockMatches(text);
    
    // Get existing blocks for this file
    const fileUri = document.uri.toString();
    const existingBlockIds = blockManager.getBlockIdsFromFile(fileUri);
    
    // Track which blocks we've seen in this parse
    const currentBlockIds = new Set<string>();

    // Update or add blocks
    for (const match of matches) {
      const block = this.createBlockFromMatch(match, document);
      if (block) {
        blockManager.set(match.id, block);
        currentBlockIds.add(match.id);
      }
    }

    // Remove only blocks that no longer exist in the document
    for (const id of existingBlockIds) {
      if (!currentBlockIds.has(id)) {
        blockManager.delete(id);
      }
    }

    // Update decorations if this is the active document
    if (
      vscode.window.activeTextEditor?.document === document
    ) {
      updateDecorations(vscode.window.activeTextEditor);
    }
  }

  async parseAllNotesFolder(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const config = vscode.workspace.getConfiguration('kernel');
    const notesFolder = config.get<string>('notesFolder', DEFAULT_CONFIG.NOTES_FOLDER);
    const filePattern = config.get<string>('filePattern', DEFAULT_CONFIG.FILE_PATTERN);
    const notesPath = path.join(rootPath, notesFolder);

    if (!fs.existsSync(notesPath)) {
      throw new ConfigurationError(
        `Kernel notes folder '${notesFolder}' not found. Update settings or create the folder.`
      );
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Parsing kernel blocks...',
        cancellable: false,
      },
      async (progress) => {
        const files = await vscode.workspace.findFiles(`${notesFolder}/${filePattern}`);

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          progress.report({
            increment: 100 / files.length,
            message: `${i + 1}/${files.length} - ${path.basename(file.fsPath)}`,
          });

          try {
            const document = await vscode.workspace.openTextDocument(file);
            this.parseDocument(document);
          } catch (error) {
            console.error(`Failed to parse ${file.fsPath}:`, error);
          }
        }

        vscode.window.showInformationMessage(
          `Parsed ${files.length} files, found ${blockManager.size} blocks`
        );
      }
    );
  }

  private findBlockMatches(text: string): Array<{id: string; startPos: number; endPos: number; matchLength: number}> {
    const matches: Array<{id: string; startPos: number; endPos: number; matchLength: number}> = [];
    const regex = new RegExp(REGEX_PATTERNS.BLOCK_END.source, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
      const id = match[1];
      const endPos = match.index;
      const startPos = this.findBlockStart(text, endPos);

      if (startPos !== -1) {
        matches.push({
          id,
          startPos,
          endPos,
          matchLength: match[0].length
        });
      }
    }

    return matches;
  }

  private findBlockStart(text: string, endPos: number): number {
    let bracketCount = 1;
    let pos = endPos - 1;

    while (pos >= 0 && bracketCount > 0) {
      if (text[pos] === ']') bracketCount++;
      else if (text[pos] === '[') bracketCount--;
      pos--;
    }

    return bracketCount === 0 ? pos + 1 : -1;
  }

  private createBlockFromMatch(
    match: {id: string; startPos: number; endPos: number; matchLength: number},
    document: vscode.TextDocument
  ): Block | null {
    const content = document.getText(
      new vscode.Range(
        document.positionAt(match.startPos + 1),
        document.positionAt(match.endPos)
      )
    ).trim();

    return {
      content,
      file: document.uri,
      line: document.positionAt(match.startPos).line,
      range: new vscode.Range(
        document.positionAt(match.startPos),
        document.positionAt(match.endPos + match.matchLength)
      ),
    };
  }
}

// Create singleton instance
export const documentParser = new DocumentParser();


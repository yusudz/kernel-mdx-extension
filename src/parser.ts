import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { blockManager } from './blockManager';
import { updateDecorations } from './decorations';

export function parseDocument(document: vscode.TextDocument): void {
  // Remove all existing blocks from this document
  blockManager.removeBlocksFromFile(document.uri.toString());

  const text = document.getText();

  // Find all ] @id patterns
  const endPattern = /\]\s*@([a-zA-Z0-9_]+)/g;
  let match;

  while ((match = endPattern.exec(text)) !== null) {
    const id = match[1];
    const endPos = match.index;

    // Find matching [ by counting brackets backwards
    let bracketCount = 1;
    let pos = endPos - 1;

    while (pos >= 0 && bracketCount > 0) {
      if (text[pos] === ']') bracketCount++;
      else if (text[pos] === '[') bracketCount--;
      pos--;
    }

    if (bracketCount === 0) {
      const startPos = pos + 1;
      const content = text.substring(startPos + 1, endPos).trim();

      blockManager.set(id, {
        content: content,
        file: document.uri,
        line: document.positionAt(startPos).line,
        range: new vscode.Range(
          document.positionAt(startPos),
          document.positionAt(endPos + match[0].length)
        ),
      });
    }
  }

  // Update decorations after parsing
  if (
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document === document
  ) {
    updateDecorations(vscode.window.activeTextEditor);
  }
}

export async function parseAllNotesFolder(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return;

  const rootPath = workspaceFolders[0].uri.fsPath;
  const config = vscode.workspace.getConfiguration('kernel');
  const notesFolder = config.get<string>('notesFolder', 'notes');
  const filePattern = config.get<string>('filePattern', '**/*.mdx');
  const notesPath = path.join(rootPath, notesFolder);

  if (!fs.existsSync(notesPath)) {
    vscode.window.showWarningMessage(
      `Kernel notes folder '${notesFolder}' not found. Update settings or create the folder.`
    );
    return;
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
          parseDocument(document);
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
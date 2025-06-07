import * as vscode from 'vscode';
import { blockManager } from './blockManager';

const blockIdDecorationType = vscode.window.createTextEditorDecorationType({
  color: '#7aa2f7',
  fontWeight: 'bold',
});

const orphanedReferenceDecorationType = vscode.window.createTextEditorDecorationType({
  color: '#ff6b6b',
  textDecoration: 'underline wavy',
  after: {
    contentText: ' ⚠️',
    color: '#ff6b6b',
  },
});

export function updateDecorations(editor?: vscode.TextEditor): void {
  if (!editor) {
    editor = vscode.window.activeTextEditor;
  }
  if (!editor || editor.document.languageId !== 'kernel-mdx') return;

  const text = editor.document.getText();
  const validDecorations: vscode.DecorationOptions[] = [];
  const orphanedDecorations: vscode.DecorationOptions[] = [];

  const regex = /@([a-zA-Z0-9_]+)\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const id = match[1];
    const startPos = editor.document.positionAt(match.index);
    const endPos = editor.document.positionAt(match.index + match[0].length);
    const range = new vscode.Range(startPos, endPos);

    if (blockManager.has(id)) {
      validDecorations.push({ range });
    } else {
      orphanedDecorations.push({
        range,
        hoverMessage: `Block @${id} not found in any file`,
      });
    }
  }

  editor.setDecorations(blockIdDecorationType, validDecorations);
  editor.setDecorations(orphanedReferenceDecorationType, orphanedDecorations);
}
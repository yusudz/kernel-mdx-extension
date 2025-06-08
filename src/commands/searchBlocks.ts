import * as vscode from 'vscode';
import * as path from 'path';
import { blockManager } from '../blockManager';
import { EmbeddingsService } from '../services/embeddingsService';
import { COMMANDS } from '../constants';

export async function searchBlocksCommand(embeddingsService: EmbeddingsService): Promise<void> {
  if (!embeddingsService.isReady()) {
    vscode.window.showErrorMessage(
      "Embeddings service is not ready. The server might still be starting up."
    );
    return;
  }
  
  const query = await vscode.window.showInputBox({
    prompt: 'What are you looking for?',
    placeHolder: 'e.g., "Should I eat out?", "panic attack", "3am thoughts"',
  });

  if (!query) return;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Searching blocks...',
        cancellable: false,
      },
      async (progress) => {
        const blocks = Array.from(blockManager.entries()).map(([id, block]) => ({
          id,
          content: block.content,
          file: block.file.fsPath,
          line: block.line,
        }));

        if (blocks.length === 0) {
          vscode.window.showWarningMessage(
            'No blocks found. Add some blocks with @id tags first!'
          );
          return;
        }

        progress.report({ message: 'Finding similar blocks...' });

        const results = await embeddingsService.findSimilar(
          query,
          blocks.map(b => ({ id: b.id, content: b.content }))
        );

        const outputContent = [
          `# Search Results: "${query}"`,
          `*Found ${results.length} relevant blocks*`,
          '',
          ...results.map((result, i) => {
            const block = blocks[result.index];
            const fileLink = `[${path.basename(block.file)}](${block.file}#L${
              block.line + 1
            })`;
            return [
              `## ${i + 1}. @${block.id} (Score: ${result.score.toFixed(3)})`,
              `*File: ${fileLink}*`,
              '',
              block.content,
              '',
            ].join('\n');
          }),
        ].join('\n');

        const doc = await vscode.workspace.openTextDocument({
          language: 'markdown',
          content: outputContent,
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Search failed: ${error.message}`);
  }
}
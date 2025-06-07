import * as vscode from 'vscode';
import * as path from 'path';
import { blockManager } from '../blockManager';
import { EmbeddingsClient } from '../embeddings';

export async function searchBlocksCommand(embeddingsClient?: EmbeddingsClient): Promise<void> {
  if (!embeddingsClient) {
    vscode.window.showErrorMessage(
      "Embeddings client is not available. The embeddings server might not be running or fully initialized. Please try again shortly or ensure the server is started."
    );
    // You could offer to run "Kernel: Setup Embeddings" or show server start instructions here as well.
    return;
  }
  
  const query = await vscode.window.showInputBox({
    prompt: 'What are you looking for?',
    placeHolder: 'e.g., "Should I move out?", "panic attack", "3am thoughts"',
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

        const results = await embeddingsClient.findSimilar(
          query,
          blocks.map((b) => b.content),
          10
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
    if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
      const action = await vscode.window.showErrorMessage(
        'Embeddings server not running. Start it to use semantic search.',
        'Show Instructions',
        'Try Again'
      );

      if (action === 'Show Instructions') {
        const instructions = [
          '# Start Embeddings Server',
          '',
          '1. Open terminal in project root',
          '2. Navigate to embeddings server:',
          '   ```',
          '   cd code/embeddings-server',
          '   ```',
          '3. Run the server:',
          '   ```',
          '   python server.py',
          '   ```',
          '',
          'The server will run on http://localhost:5000',
        ].join('\n');

        const doc = await vscode.workspace.openTextDocument({
          language: 'markdown',
          content: instructions,
        });
        await vscode.window.showTextDocument(doc);
      } else if (action === 'Try Again') {
        vscode.commands.executeCommand('kernel-mdx.searchBlocks');
      }
      return;
    }

    vscode.window.showErrorMessage(`Search failed: ${error.message}`);
  }
}
import * as vscode from 'vscode';

export class KernelFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    const text = document.getText();
    const lines = text.split('\n');
    const stack: { line: number; bracket: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bracketPairs: { [key: string]: string } = {
        '[': ']',
        '{': '}',
        '(': ')',
      };
      const closingBrackets = new Set(Object.values(bracketPairs));

      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        if (bracketPairs[char]) {
          stack.push({ line: i, bracket: char });
        } else if (closingBrackets.has(char) && stack.length > 0) {
          for (let k = stack.length - 1; k >= 0; k--) {
            if (bracketPairs[stack[k].bracket] === char) {
              const startLine = stack[k].line;
              stack.splice(k, 1);

              if (startLine !== i) {
                ranges.push(
                  new vscode.FoldingRange(
                    startLine,
                    i - 1,
                    vscode.FoldingRangeKind.Region
                  )
                );
              }
              break;
            }
          }
        }
      }
    }

    return ranges;
  }
}
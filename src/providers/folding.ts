import * as vscode from 'vscode';
import { BRACKETS } from '../constants';

interface BracketInfo {
  line: number;
  bracket: string;
}

export class KernelFoldingRangeProvider implements vscode.FoldingRangeProvider {
  private bracketPairs = BRACKETS.PAIRS;
  private closingBrackets = BRACKETS.CLOSING;

  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    const lines = document.getText().split('\n');
    const stacks = new Map<string, BracketInfo[]>();

    // Initialize stacks for each bracket type
    Object.keys(this.bracketPairs).forEach(bracket => {
      stacks.set(bracket, []);
    });

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      this.processLine(lines[lineNum], lineNum, stacks, ranges);
    }

    return ranges;
  }

  private processLine(
    line: string,
    lineNum: number,
    stacks: Map<string, BracketInfo[]>,
    ranges: vscode.FoldingRange[]
  ): void {
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];

      if (char in this.bracketPairs) {
        // Opening bracket found
        const stack = stacks.get(char)!;
        stack.push({ line: lineNum, bracket: char });
      } else if (this.closingBrackets.has(char)) {
        // Closing bracket found
        this.handleClosingBracket(char, lineNum, stacks, ranges);
      }
    }
  }

  private handleClosingBracket(
    closingChar: string,
    currentLine: number,
    stacks: Map<string, BracketInfo[]>,
    ranges: vscode.FoldingRange[]
  ): void {
    // Find matching opening bracket
    for (const [openingChar, expectedClosing] of Object.entries(this.bracketPairs)) {
      if (expectedClosing === closingChar) {
        const stack = stacks.get(openingChar)!;
        
        if (stack.length > 0) {
          const startInfo = stack.pop()!;
          
          if (startInfo.line !== currentLine) {
            ranges.push(
              new vscode.FoldingRange(
                startInfo.line,
                currentLine - 1,
                vscode.FoldingRangeKind.Region
              )
            );
          }
        }
        break;
      }
    }
  }
}
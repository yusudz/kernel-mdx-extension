import * as path from 'path';
import { Block } from '../types';
import { FileStorage } from './storage/FileStorage';
import { ConfigManager } from './storage/ConfigManager';

export interface ParsedBlock {
  id: string;
  content: string;
  file: string;
  line: number;
  startPos: number;
  endPos: number;
}

export class BlockParser {
  private blockMap = new Map<string, Block>();
  private fileIndex = new Map<string, Set<string>>(); // file path -> block IDs

  constructor(
    private fileStorage: FileStorage,
    private configManager: ConfigManager
  ) {}

  async parseAllFiles(): Promise<void> {
    // Clear existing blocks
    this.blockMap.clear();
    this.fileIndex.clear();
    
    const allFiles: string[] = [];
    
    // Parse legacy blocks directory
    const pattern = this.configManager.get('filePattern');
    const blockFiles = await this.fileStorage.findMdxFiles(pattern);
    allFiles.push(...blockFiles);
    
    // Parse log directory files
    const logDir = this.fileStorage.getLogDirectory();
    const logPattern = '**/*.mdx';
    const { glob } = await import('glob');
    const logFiles = await glob(logPattern, { cwd: logDir, absolute: true });
    allFiles.push(...logFiles);
    
    // Parse organized log directory files
    const logOrganizedDir = this.fileStorage.getLogOrganizedDirectory();
    const organizedLogFiles = await glob(logPattern, { cwd: logOrganizedDir, absolute: true });
    allFiles.push(...organizedLogFiles);
    
    console.log(`Parsing ${allFiles.length} MDX files from blocks, log, and log_organized directories...`);
    
    for (const filePath of allFiles) {
      try {
        await this.parseFile(filePath);
      } catch (error) {
        console.error(`Failed to parse ${filePath}:`, error);
      }
    }
    
    console.log(`Parsed ${allFiles.length} files, found ${this.blockMap.size} blocks`);
  }

  async parseFile(filePath: string): Promise<void> {
    const content = await this.fileStorage.readFile(filePath);
    const matches = this.findBlockMatches(content);
    
    // Remove existing blocks from this file
    const existingBlockIds = this.getBlockIdsFromFile(filePath);
    for (const id of existingBlockIds) {
      this.deleteBlock(id);
    }
    
    // Add new blocks
    for (const match of matches) {
      const block = this.createBlockFromMatch(match, filePath, content);
      if (block) {
        this.setBlock(match.id, block);
      }
    }
  }

  private findBlockMatches(text: string): Array<{id: string; startPos: number; endPos: number; matchLength: number}> {
    const matches: Array<{id: string; startPos: number; endPos: number; matchLength: number}> = [];
    // Pattern: ] @blockId (end of block)
    const blockEndRegex = /\]\s*@([a-zA-Z0-9_]+)/g;
    let match;

    while ((match = blockEndRegex.exec(text)) !== null) {
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
    filePath: string,
    text: string
  ): Block | null {
    const content = text.substring(match.startPos + 1, match.endPos).trim();
    const line = this.getLineNumber(text, match.startPos);

    return {
      id: match.id,
      content,
      file: filePath,
      line,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private getLineNumber(text: string, position: number): number {
    return text.substring(0, position).split('\n').length - 1;
  }

  private setBlock(id: string, block: Block): void {
    this.blockMap.set(id, block);
    
    // Update file index
    if (!this.fileIndex.has(block.file)) {
      this.fileIndex.set(block.file, new Set());
    }
    this.fileIndex.get(block.file)!.add(id);
  }

  private deleteBlock(id: string): boolean {
    const block = this.blockMap.get(id);
    if (!block) return false;

    this.blockMap.delete(id);
    
    // Update file index
    const fileBlocks = this.fileIndex.get(block.file);
    if (fileBlocks) {
      fileBlocks.delete(id);
      if (fileBlocks.size === 0) {
        this.fileIndex.delete(block.file);
      }
    }

    return true;
  }

  private getBlockIdsFromFile(filePath: string): string[] {
    const blockIds = this.fileIndex.get(filePath);
    return blockIds ? Array.from(blockIds) : [];
  }

  // Public API
  getBlock(id: string): Block | undefined {
    return this.blockMap.get(id);
  }

  getAllBlocks(): Block[] {
    return Array.from(this.blockMap.values());
  }

  getBlocksFromFile(filePath: string): Block[] {
    const blockIds = this.fileIndex.get(filePath);
    if (!blockIds) return [];

    return Array.from(blockIds)
      .map(id => this.blockMap.get(id))
      .filter((block): block is Block => block !== undefined);
  }

  searchBlocks(query: string): Block[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllBlocks().filter(block => 
      block.content.toLowerCase().includes(lowerQuery) ||
      block.id.toLowerCase().includes(lowerQuery)
    );
  }

  generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id: string;
    
    do {
      id = Array.from({ length: 6 }, () => 
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    } while (this.blockMap.has(id));
    
    return id;
  }

  get size(): number {
    return this.blockMap.size;
  }
}
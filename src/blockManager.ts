import * as vscode from 'vscode';
import { Block } from './types';

export class BlockManager {
  private blockMap = new Map<string, Block>();

  get(id: string): Block | undefined {
    return this.blockMap.get(id);
  }

  set(id: string, block: Block): void {
    this.blockMap.set(id, block);
  }

  has(id: string): boolean {
    return this.blockMap.has(id);
  }

  delete(id: string): boolean {
    return this.blockMap.delete(id);
  }

  clear(): void {
    this.blockMap.clear();
  }

  get size(): number {
    return this.blockMap.size;
  }

  entries(): IterableIterator<[string, Block]> {
    return this.blockMap.entries();
  }

  generateId(): string {
    let id: string;
    do {
      id = Math.random().toString(36).substring(2, 8);
    } while (this.has(id));
    return id;
  }

  removeBlocksFromFile(fileUri: string): void {
    for (const [id, block] of this.entries()) {
      if (block.file.toString() === fileUri) {
        this.delete(id);
      }
    }
  }
}

export const blockManager = new BlockManager();
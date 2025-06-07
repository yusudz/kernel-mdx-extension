import * as vscode from 'vscode';
import { Block } from './types';
import { eventBus } from './events/eventBus';
import { BlockNotFoundError } from './errors';

export class BlockManager {
  private blockMap = new Map<string, Block>();
  private fileIndex = new Map<string, Set<string>>(); // file URI -> block IDs

  get(id: string): Block {
    const block = this.blockMap.get(id);
    if (!block) {
      throw new BlockNotFoundError(id);
    }
    return block;
  }

  tryGet(id: string): Block | undefined {
    return this.blockMap.get(id);
  }

  set(id: string, block: Block): void {
    const isNew = !this.blockMap.has(id);
    this.blockMap.set(id, block);
    
    // Update file index
    const fileUri = block.file.toString();
    if (!this.fileIndex.has(fileUri)) {
      this.fileIndex.set(fileUri, new Set());
    }
    this.fileIndex.get(fileUri)!.add(id);

    // Emit event
    eventBus.emit(isNew ? 'block:added' : 'block:updated', {
      id,
      uri: block.file,
    });
  }

  has(id: string): boolean {
    return this.blockMap.has(id);
  }

  delete(id: string): boolean {
    const block = this.blockMap.get(id);
    if (!block) return false;

    this.blockMap.delete(id);
    
    // Update file index
    const fileUri = block.file.toString();
    const fileBlocks = this.fileIndex.get(fileUri);
    if (fileBlocks) {
      fileBlocks.delete(id);
      if (fileBlocks.size === 0) {
        this.fileIndex.delete(fileUri);
      }
    }

    eventBus.emit('block:removed', { id, uri: block.file });
    return true;
  }

  clear(): void {
    this.blockMap.clear();
    this.fileIndex.clear();
    eventBus.emit('blocks:cleared', undefined);
  }

  get size(): number {
    return this.blockMap.size;
  }

  entries(): IterableIterator<[string, Block]> {
    return this.blockMap.entries();
  }

  generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id: string;
    
    do {
      id = Array.from({ length: 6 }, () => 
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    } while (this.has(id));
    
    return id;
  }

  removeBlocksFromFile(fileUri: string): void {
    const blockIds = this.fileIndex.get(fileUri);
    if (!blockIds) return;

    for (const id of blockIds) {
      this.delete(id);
    }
  }

  getBlocksFromFile(fileUri: string): Block[] {
    const blockIds = this.fileIndex.get(fileUri);
    if (!blockIds) return [];

    return Array.from(blockIds)
      .map(id => this.tryGet(id))
      .filter((block): block is Block => block !== undefined);
  }
}

export const blockManager = new BlockManager();
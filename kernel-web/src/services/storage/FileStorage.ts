import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { Block, Conversation, ConversationMessage } from '../../types';

export class FileStorage {
  private blocksDir: string;
  private conversationsDir: string;
  private logDir: string;
  private logOrganizedDir: string;

  constructor(baseDir: string = './data') {
    this.blocksDir = path.resolve(baseDir, 'blocks');
    this.conversationsDir = path.resolve(baseDir, 'conversations');
    this.logDir = path.resolve(baseDir, 'log');
    this.logOrganizedDir = path.resolve(baseDir, 'log_organized');
    
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [this.blocksDir, this.conversationsDir, this.logDir, this.logOrganizedDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Block management
  async findMdxFiles(pattern: string = '**/*.mdx'): Promise<string[]> {
    const fullPattern = path.join(this.blocksDir, pattern);
    return glob(fullPattern);
  }

  async findFiles(filename: string): Promise<string[]> {
    const fullPattern = path.join(this.blocksDir, '**', filename);
    return glob(fullPattern);
  }

  async readFile(filePath: string): Promise<string> {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error}`);
    }
  }

  async createBlock(id: string, content: string, filename?: string): Promise<string> {
    const fileName = filename || `${id}.mdx`;
    const filePath = path.join(this.blocksDir, fileName);
    
    const blockContent = `[${content}] @${id}\n`;
    await this.writeFile(filePath, blockContent);
    
    return filePath;
  }

  // Conversation management  
  async saveConversation(conversation: Conversation): Promise<void> {
    const filePath = path.join(this.conversationsDir, `${conversation.id}.json`);
    
    try {
      const data = {
        ...conversation,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: conversation.messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp?.toISOString()
        }))
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      throw new Error(`Failed to save conversation ${conversation.id}: ${error}`);
    }
  }

  async loadConversation(id: string): Promise<Conversation | null> {
    const filePath = path.join(this.conversationsDir, `${id}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        messages: data.messages.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
        }))
      };
    } catch (error) {
      console.error(`Failed to load conversation ${id}:`, error);
      return null;
    }
  }

  async listConversations(): Promise<Conversation[]> {
    try {
      const files = fs.readdirSync(this.conversationsDir)
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
      
      const conversations: Conversation[] = [];
      
      for (const id of files) {
        const conversation = await this.loadConversation(id);
        if (conversation) {
          conversations.push(conversation);
        }
      }
      
      return conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.error('Failed to list conversations:', error);
      return [];
    }
  }

  async deleteConversation(id: string): Promise<boolean> {
    const filePath = path.join(this.conversationsDir, `${id}.json`);
    
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete conversation ${id}:`, error);
      return false;
    }
  }

  // Log-based file management
  findCurrentActiveLogFile(): string {
    try {
      const logFiles = fs.readdirSync(this.logDir)
        .filter(file => file.endsWith('.mdx') && /^\d+\.mdx$/.test(file))
        .map(file => parseInt(path.basename(file, '.mdx')))
        .filter(num => !isNaN(num))
        .sort((a, b) => b - a); // Sort descending
      
      if (logFiles.length === 0) {
        // No log files exist, create the first one
        const firstLogPath = path.join(this.logDir, '1.mdx');
        fs.writeFileSync(firstLogPath, '');
        return firstLogPath;
      }
      
      // Return the highest numbered log file
      const currentLogNumber = logFiles[0];
      return path.join(this.logDir, `${currentLogNumber}.mdx`);
    } catch (error) {
      // If error, create first log file
      const firstLogPath = path.join(this.logDir, '1.mdx');
      fs.writeFileSync(firstLogPath, '');
      return firstLogPath;
    }
  }

  async appendBlockToActiveLog(id: string, content: string): Promise<string> {
    const activeLogPath = this.findCurrentActiveLogFile();
    const blockContent = `[${content}] @${id}\n\n`;
    
    try {
      fs.appendFileSync(activeLogPath, blockContent);
      return activeLogPath;
    } catch (error) {
      throw new Error(`Failed to append block to active log: ${error}`);
    }
  }

  getOrganizedLogFiles(): string[] {
    try {
      return fs.readdirSync(this.logOrganizedDir)
        .filter(file => file.endsWith('.mdx'))
        .map(file => path.join(this.logOrganizedDir, file))
        .sort(); // Sort to ensure consistent order
    } catch (error) {
      return [];
    }
  }

  getCurrentActiveLogContent(): string {
    try {
      const activeLogPath = this.findCurrentActiveLogFile();
      return fs.readFileSync(activeLogPath, 'utf-8');
    } catch (error) {
      return '';
    }
  }

  // Utility methods
  getBlocksDirectory(): string {
    return this.blocksDir;
  }

  getConversationsDirectory(): string {
    return this.conversationsDir;
  }

  getLogDirectory(): string {
    return this.logDir;
  }

  getLogOrganizedDirectory(): string {
    return this.logOrganizedDir;
  }
}
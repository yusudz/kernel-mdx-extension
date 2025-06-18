import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../../types';

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor(configPath: string = './data/config.json') {
    this.configPath = path.resolve(configPath);
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const defaultConfig: Config = {
      notesFolder: './data/blocks',
      filePattern: '**/*.mdx',
      claudeModel: 'claude-4-sonnet-20250514',
      openaiModel: 'gpt-4.1-mini',
      geminiModel: 'gemini-2.5-flash',
      alwaysIncludeFiles: [],
      authToken: 'your-secret-token-here'
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        const savedConfig = JSON.parse(fileContent);
        return { ...defaultConfig, ...savedConfig };
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }

    return defaultConfig;
  }

  private saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    this.config[key] = value;
    this.saveConfig();
  }

  getAll(): Config {
    return { ...this.config };
  }

  update(updates: Partial<Config>): void {
    Object.assign(this.config, updates);
    this.saveConfig();
  }
}
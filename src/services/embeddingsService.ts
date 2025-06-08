import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import { EmbeddingsClient } from "../embeddings";

export interface EmbeddingsServiceOptions {
  serverDir: string;
  serverScript: string;
  maxStartupTime: number;
  pythonCommands: string[];
}

export class EmbeddingsService {
  private process?: ChildProcess;
  private client?: EmbeddingsClient;
  private isStarting = false;
  private startPromise?: Promise<void>;

  constructor(private options: EmbeddingsServiceOptions) {}

  async start(): Promise<void> {
    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }

    if (this.process && !this.process.killed) {
      console.log("Embeddings server already running");
      return;
    }

    this.isStarting = true;
    this.startPromise = this.doStart();
    
    try {
      await this.startPromise;
    } finally {
      this.isStarting = false;
      this.startPromise = undefined;
    }
  }

  private async doStart(): Promise<void> {
    if (!fs.existsSync(this.options.serverScript)) {
      throw new Error(
        "Embeddings server not found. Please ensure the embeddings-server directory is in the extension folder."
      );
    }

    for (const pythonCmd of this.options.pythonCommands) {
      try {
        const success = await this.tryStartWithCommand(pythonCmd);
        if (success) {
          console.log(`Successfully started embeddings server with ${pythonCmd}`);
          return;
        }
      } catch (error) {
        console.error(`Failed to start with ${pythonCmd}:`, error);
      }
    }

    throw new Error(
      "Failed to start embeddings server. Please ensure Python is installed with required packages."
    );
  }

  private async tryStartWithCommand(pythonCmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`Trying to start embeddings server with: ${pythonCmd}`);

      const childProcess = spawn(pythonCmd, [this.options.serverScript], {
        cwd: this.options.serverDir,
        windowsHide: true,
      });

      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          if (childProcess && !childProcess.killed) {
            childProcess.kill();
          }
        }
      };

      const timeout = setTimeout(() => {
        console.log(`Timeout waiting for ${pythonCmd}`);
        cleanup();
        resolve(false);
      }, this.options.maxStartupTime);

      childProcess.stdout?.on("data", (data) => {
        const output = data.toString();
        console.log(`Embeddings Server stdout (${pythonCmd}): ${output}`);
        
        if (!resolved && this.isServerReady(output)) {
          clearTimeout(timeout);
          resolved = true;
          this.process = childProcess;
          this.client = new EmbeddingsClient();
          resolve(true);
        }
      });

      childProcess.stderr?.on("data", (data) => {
        const error = data.toString();
        console.error(`Embeddings Server stderr (${pythonCmd}): ${error}`);
        
        if (this.isWarning(error)) {
          return;
        }
        
        if (this.isFatalError(error)) {
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        }
      });

      childProcess.on("error", (error) => {
        console.error(`Failed to spawn ${pythonCmd}: ${error.message}`);
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      });

      childProcess.on("close", (code) => {
        console.log(`Process ${pythonCmd} exited with code ${code}`);
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      });
    });
  }

  private isServerReady(output: string): boolean {
    const lowercased = output.toLowerCase();
    return (
      lowercased.includes("model loaded") ||
      lowercased.includes("running on http://localhost:5000")
    );
  }

  private isWarning(error: string): boolean {
    return (
      error.includes("WARNING") ||
      error.includes("Debugger") ||
      error.includes("Restarting with stat") ||
      error.includes("Debug mode")
    );
  }

  private isFatalError(error: string): boolean {
    return error.includes("ModuleNotFoundError") || error.includes("Traceback");
  }

  stop(): void {
    if (this.process && !this.process.killed) {
      console.log("Stopping embeddings server");
      this.process.kill();
      this.process = undefined;
      this.client = undefined;
    }
  }

  getClient(): EmbeddingsClient | undefined {
    return this.client;
  }

  isRunning(): boolean {
    return this.process !== undefined && !this.process.killed;
  }
}
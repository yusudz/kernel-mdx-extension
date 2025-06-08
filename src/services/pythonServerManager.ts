import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import { EventEmitter } from "events";

export interface ServerConfig {
  serverDir: string;
  serverScript: string;
  port: number;
  maxStartupTime: number;
  pythonCommands: string[];
  env?: NodeJS.ProcessEnv;
  args?: string[];

  // Optional ready detection
  readyWhen?: {
    stdout?: RegExp;
    endpoint?: {
      path: string;
      check?: (response: any) => boolean;
    };
  };
}

export interface ServerEvents {
  started: () => void;
  stopped: () => void;
  error: (error: Error) => void;
  output: (data: string) => void;
  ready: () => void;
}

export class PythonServerManager extends EventEmitter {
  private process?: ChildProcess;
  private baseUrl: string;
  private isStarting = false;
  private startPromise?: Promise<void>;
  private ready = false;

  constructor(private config: ServerConfig) {
    super();
    this.baseUrl = `http://localhost:${config.port}`;
  }

  async start(): Promise<void> {
    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }

    if (this.process && !this.process.killed) {
      console.log("Server already running");
      return;
    }

    this.isStarting = true;
    this.startPromise = this.doStart();

    try {
      await this.startPromise;
      this.emit("started");
    } finally {
      this.isStarting = false;
      this.startPromise = undefined;
    }
  }

  private async doStart(): Promise<void> {
    if (!fs.existsSync(this.config.serverScript)) {
      throw new Error(`Server script not found: ${this.config.serverScript}`);
    }

    for (const pythonCmd of this.config.pythonCommands) {
      try {
        const success = await this.tryStartWithCommand(pythonCmd);
        if (success) {
          console.log(`Successfully started server with ${pythonCmd}`);
          return;
        }
      } catch (error) {
        console.error(`Failed to start with ${pythonCmd}:`, error);
      }
    }

    throw new Error(
      "Failed to start server. Please ensure Python is installed with required packages."
    );
  }

  private async tryStartWithCommand(pythonCmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`Trying to start server with: ${pythonCmd}`);

      const args = [this.config.serverScript, ...(this.config.args || [])];
      const childProcess = spawn(pythonCmd, args, {
        cwd: this.config.serverDir,
        windowsHide: true,
        env: { ...process.env, ...this.config.env },
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
      }, this.config.maxStartupTime);

      childProcess.stdout?.on("data", async (data) => {
        const output = data.toString();
        console.log(`Server stdout: ${output}`);
        this.emit("output", output);

        // Check stdout pattern if configured
        if (!resolved && this.config.readyWhen?.stdout?.test(output)) {
          clearTimeout(timeout);
          resolved = true;
          this.process = childProcess;
          this.setReady();
          resolve(true);
        }
      });

      childProcess.stderr?.on("data", (data) => {
        const error = data.toString();
        console.error(`Server stderr: ${error}`);

        // Check for fatal errors
        if (
          error.includes("ModuleNotFoundError") ||
          error.includes("Traceback")
        ) {
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        }
      });

      childProcess.on("error", (error) => {
        console.error(`Failed to spawn ${pythonCmd}: ${error.message}`);
        this.emit("error", error);
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      });

      childProcess.on("close", (code) => {
        console.log(`Process exited with code ${code}`);
        this.ready = false;
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      });

      // If endpoint ready check is configured, start polling after process spawns
      if (!resolved && this.config.readyWhen?.endpoint) {
        this.process = childProcess;
        this.waitForEndpoint()
          .then(() => {
            if (!resolved) {
              clearTimeout(timeout);
              resolved = true;
              this.setReady();
              resolve(true);
            }
          })
          .catch(() => {
            clearTimeout(timeout);
            cleanup();
            resolve(false);
          });
      }
    });
  }

  private async waitForEndpoint(): Promise<void> {
    if (!this.config.readyWhen?.endpoint) return;

    const { path, check } = this.config.readyWhen.endpoint;
    const startTime = Date.now();
    const interval = 500;

    while (Date.now() - startTime < this.config.maxStartupTime) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`);

        if (response.ok) {
          if (!check) {
            return; // Any 200 response means ready
          }

          const data = await response.json();
          if (check(data)) {
            return;
          }
        }
      } catch (error) {
        // Server not ready yet
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error("Server failed to become ready");
  }

  async fetch(path: string, options?: RequestInit): Promise<Response> {
    if (!this.isRunning()) {
      throw new Error("Server is not running");
    }

    if (!this.ready) {
      throw new Error("Server is not ready yet");
    }

    return fetch(`${this.baseUrl}${path}`, options);
  }

  private setReady(): void {
    if (!this.ready) {
      this.ready = true;
      this.emit("ready");
    }
  }

  stop(): void {
    if (this.process && !this.process.killed) {
      console.log("Stopping server");
      this.process.kill();
      this.process = undefined;
      this.ready = false;
      this.emit("stopped");
    }
  }

  isReady(): boolean {
    return this.ready && this.isRunning();
  }

  isRunning(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

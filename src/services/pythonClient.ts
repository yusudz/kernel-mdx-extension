import { PythonServerManager } from "./pythonServerManager";

export abstract class PythonClient {
  constructor(protected server: PythonServerManager) {}

  protected async request<T = any>(
    path: string, 
    options?: RequestInit
  ): Promise<T> {
    // Fail fast if server not ready
    if (!this.isReady()) {
      throw new Error('Server is not ready');
    }
    
    const response = await this.server.fetch(path, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${response.status}: ${error}`);
    }
    
    return response.json();
  }

  protected async post<T = any>(
    path: string, 
    data: any
  ): Promise<T> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  // Public method to check if server is ready
  isReady(): boolean {
    return this.server.isReady();
  }
}
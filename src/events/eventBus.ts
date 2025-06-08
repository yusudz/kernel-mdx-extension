import * as vscode from 'vscode';

export interface KernelEvents {
  'block:added': { id: string; uri: vscode.Uri };
  'block:removed': { id: string; uri: vscode.Uri };
  'block:updated': { id: string; uri: vscode.Uri };
  'blocks:cleared': undefined;
  'embeddings:started': undefined;
  'embeddings:stopped': undefined;
  'embeddings:error': { error: Error };
}

export class EventBus {
  private emitter = new vscode.EventEmitter<{
    type: keyof KernelEvents;
    data: KernelEvents[keyof KernelEvents];
  }>();

  on<T extends keyof KernelEvents>(
    event: T,
    listener: (data: KernelEvents[T]) => void
  ): vscode.Disposable {
    return this.emitter.event((e) => {
      if (e.type === event) {
        listener(e.data as KernelEvents[T]);
      }
    });
  }

  emit<T extends keyof KernelEvents>(event: T, data: KernelEvents[T]): void {
    this.emitter.fire({ type: event, data });
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

export const eventBus = new EventBus();
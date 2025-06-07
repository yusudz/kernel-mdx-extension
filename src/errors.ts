export class KernelError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'KernelError';
  }
}

export class EmbeddingsServerError extends KernelError {
  constructor(message: string, public readonly cause?: Error) {
    super(message, 'EMBEDDINGS_SERVER_ERROR');
  }
}

export class BlockNotFoundError extends KernelError {
  constructor(public readonly blockId: string) {
    super(`Block @${blockId} not found`, 'BLOCK_NOT_FOUND');
  }
}

export class ConfigurationError extends KernelError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
  }
}
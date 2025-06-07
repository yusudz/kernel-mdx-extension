export const EXTENSION_ID = 'kernel-mdx';
export const LANGUAGE_ID = 'kernel-mdx';

export const COMMANDS = {
  SEARCH_BLOCKS: 'kernel-mdx.searchBlocks',
  SETUP_EMBEDDINGS: 'kernel-mdx.setupEmbeddings',
  FLUSH_BLOCKS: 'kernel-mdx.flushBlocks',
  OPEN_CHAT: 'kernel-mdx.openChat',
  PARSE_ALL_NOTES: 'kernel-mdx.parseAllNotes',
  COPY_CONTEXT: 'kernel-mdx.copyContext',
  ADD_BLOCK_ID: 'kernel-mdx.addBlockId',
} as const;

export const REGEX_PATTERNS = {
  BLOCK_END: /\]\s*@([a-zA-Z0-9_]+)/g,
  BLOCK_REFERENCE: /@([a-zA-Z0-9_]+)\b/g,
  BLOCK_REFERENCE_NOT_IN_BLOCK: /(?<!\]\s*)@([a-zA-Z0-9_]+)\b/g,
} as const;

export const DEFAULT_CONFIG = {
  NOTES_FOLDER: 'notes',
  FILE_PATTERN: '**/*.mdx',
  ALWAYS_INCLUDE_FILES: ['kernel_instructions.mdx'],
  PREFERRED_MODEL: 'claude-4-sonnet-20250514',
  MAX_TOKENS: 4000,
  EMBEDDINGS_PORT: 5000,
  EMBEDDINGS_STARTUP_TIMEOUT: 240000,
} as const;

export const BRACKETS = {
  PAIRS: { '[': ']', '{': '}', '(': ')' },
  OPENING: new Set(['[', '{', '(']),
  CLOSING: new Set([']', '}', ')']),
} as const;
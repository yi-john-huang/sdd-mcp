import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import writeFileAtomic from "write-file-atomic";

const pendingWrites = new Map<string, Promise<void>>();

export interface AtomicWriteOptions {
  readonly encoding?: BufferEncoding;
  readonly mode?: number;
}

/**
 * Atomically replaces a file. `write-file-atomic` queues concurrent writes to
 * the same destination, preserves an existing mode by default, cleans its
 * temporary file on failure, and implements replacement on Windows.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const key = resolve(filePath);
  const prior = pendingWrites.get(key) ?? Promise.resolve();
  const operation = prior
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFileAtomic(filePath, content, {
        encoding: options.encoding ?? "utf8",
        mode: options.mode,
      });
    });
  pendingWrites.set(key, operation);
  try {
    await operation;
  } finally {
    if (pendingWrites.get(key) === operation) pendingWrites.delete(key);
  }
}

/**
 * Write JSON content to a file atomically.
 *
 * Convenience wrapper that handles JSON serialization with pretty printing.
 *
 * @param filePath - The target file path
 * @param data - The data to serialize and write
 * @param options - Optional options (indent spaces, default 2)
 * @returns Promise that resolves when write is complete
 *
 * @example
 * ```typescript
 * await atomicWriteJSON('/path/to/spec.json', specData);
 * ```
 */
export async function atomicWriteJSON(
  filePath: string,
  data: unknown,
  options?: { indent?: number }
): Promise<void> {
  const indent = options?.indent ?? 2;
  const content = JSON.stringify(data, null, indent);
  await atomicWriteFile(filePath, content);
}

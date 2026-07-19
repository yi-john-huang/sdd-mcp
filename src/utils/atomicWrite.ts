import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import writeFileAtomic from "write-file-atomic";

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
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, content, {
    encoding: options.encoding ?? "utf8",
    mode: options.mode,
  });
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

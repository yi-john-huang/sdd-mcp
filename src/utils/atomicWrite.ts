/**
 * Atomic file write utility
 * 原子性檔案寫入工具
 *
 * Prevents file corruption when write operations are interrupted (crash, kill signal).
 * Uses the temp-file + rename pattern which is atomic on POSIX systems.
 * 防止寫入操作被中斷時（crash、kill signal）造成檔案損壞。
 * 使用 temp-file + rename 模式，在 POSIX 系統上是原子操作。
 *
 * @note Windows Limitation / Windows 限制:
 *   On Windows, fs.rename() may fail with EEXIST if target exists.
 *   For Windows production use, consider using 'write-file-atomic' package.
 *   在 Windows 上，若目標檔案存在，fs.rename() 可能會失敗。
 *   若需在 Windows 生產環境使用，建議改用 'write-file-atomic' 套件。
 *
 * @module utils/atomicWrite
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Write content to a file atomically.
 *
 * This function writes to a temporary file first, then renames it to the target path.
 * The rename operation is atomic on POSIX systems, ensuring the file is never left
 * in a corrupted state.
 *
 * @param filePath - The target file path
 * @param content - The content to write
 * @param options - Optional write options
 * @returns Promise that resolves when write is complete
 *
 * @example
 * ```typescript
 * await atomicWriteFile('/path/to/spec.json', JSON.stringify(data, null, 2));
 * ```
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options?: { encoding?: BufferEncoding }
): Promise<void> {
  const encoding = options?.encoding ?? "utf8";
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);

  // Create temp file path with process ID and timestamp for uniqueness
  const tempPath = path.join(dir, `.${filename}.${process.pid}.${Date.now()}.tmp`);

  try {
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file
    await fs.writeFile(tempPath, content, encoding);

    // Atomic rename (on POSIX systems)
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
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

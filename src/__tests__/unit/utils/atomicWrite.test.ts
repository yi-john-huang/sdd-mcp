/**
 * Unit tests for atomicWrite utility
 *
 * Tests the atomic file write functions that prevent file corruption
 * when write operations are interrupted.
 */

import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWriteFile, atomicWriteJSON } from "../../../utils/atomicWrite";

describe("atomicWrite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "atomic-write-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("atomicWriteFile", () => {
    it("should write content to a file", async () => {
      const filePath = join(tempDir, "test.txt");
      const content = "Hello, World!";

      await atomicWriteFile(filePath, content);

      const result = await readFile(filePath, "utf8");
      expect(result).toBe(content);
    });

    it("should overwrite existing file", async () => {
      const filePath = join(tempDir, "test.txt");

      await atomicWriteFile(filePath, "first content");
      await atomicWriteFile(filePath, "second content");

      const result = await readFile(filePath, "utf8");
      expect(result).toBe("second content");
    });

    it("should create parent directories if they do not exist", async () => {
      const filePath = join(tempDir, "nested", "dir", "test.txt");
      const content = "nested content";

      await atomicWriteFile(filePath, content);

      const result = await readFile(filePath, "utf8");
      expect(result).toBe(content);
    });

    it("should not leave temp files on success", async () => {
      const filePath = join(tempDir, "test.txt");
      await atomicWriteFile(filePath, "content");

      const files = await readdir(tempDir);
      expect(files).toEqual(["test.txt"]);
    });

    it("should work with special characters in filename", async () => {
      // Test filenames with spaces and special chars (common in user projects)
      const filePath = join(tempDir, "test file (1).txt");
      await atomicWriteFile(filePath, "content");

      const content = await readFile(filePath, "utf8");
      expect(content).toBe("content");
    });

    it("should handle empty content", async () => {
      const filePath = join(tempDir, "empty.txt");
      await atomicWriteFile(filePath, "");

      const result = await readFile(filePath, "utf8");
      expect(result).toBe("");
    });

    it("should handle unicode content", async () => {
      const filePath = join(tempDir, "unicode.txt");
      const content = "你好世界 🌍 こんにちは";

      await atomicWriteFile(filePath, content);

      const result = await readFile(filePath, "utf8");
      expect(result).toBe(content);
    });

    it("should preserve file content integrity", async () => {
      const filePath = join(tempDir, "large.txt");
      const content = "a".repeat(100000); // 100KB

      await atomicWriteFile(filePath, content);

      const result = await readFile(filePath, "utf8");
      expect(result).toBe(content);
      expect(result.length).toBe(100000);
    });
  });

  describe("atomicWriteJSON", () => {
    it("should write JSON object to file", async () => {
      const filePath = join(tempDir, "test.json");
      const data = { name: "test", value: 42 };

      await atomicWriteJSON(filePath, data);

      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(data);
    });

    it("should format JSON with default 2-space indent", async () => {
      const filePath = join(tempDir, "test.json");
      const data = { name: "test" };

      await atomicWriteJSON(filePath, data);

      const content = await readFile(filePath, "utf8");
      expect(content).toBe('{\n  "name": "test"\n}');
    });

    it("should respect custom indent option", async () => {
      const filePath = join(tempDir, "test.json");
      const data = { name: "test" };

      await atomicWriteJSON(filePath, data, { indent: 4 });

      const content = await readFile(filePath, "utf8");
      expect(content).toBe('{\n    "name": "test"\n}');
    });

    it("should handle nested objects", async () => {
      const filePath = join(tempDir, "nested.json");
      const data = {
        spec: {
          feature_name: "test-feature",
          phase: "requirements",
          approvals: {
            requirements: { generated: true },
          },
        },
      };

      await atomicWriteJSON(filePath, data);

      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(data);
    });

    it("should handle arrays", async () => {
      const filePath = join(tempDir, "array.json");
      const data = [1, 2, 3, { name: "test" }];

      await atomicWriteJSON(filePath, data);

      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(data);
    });

    it("should handle null and undefined values", async () => {
      const filePath = join(tempDir, "null.json");
      const data = { a: null, b: undefined };

      await atomicWriteJSON(filePath, data);

      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      // undefined values are omitted in JSON
      expect(parsed).toEqual({ a: null });
    });

    it("should throw on circular references", async () => {
      const filePath = join(tempDir, "circular.json");
      const data: Record<string, unknown> = { name: "test" };
      data.self = data; // Create circular reference

      await expect(atomicWriteJSON(filePath, data)).rejects.toThrow(TypeError);

      // Verify no file was created (error occurs before atomicWriteFile is called)
      const files = await readdir(tempDir);
      expect(files).not.toContain("circular.json");
    });

    it("should throw on BigInt values", async () => {
      const filePath = join(tempDir, "bigint.json");
      const data = { value: BigInt(9007199254740991) };

      await expect(atomicWriteJSON(filePath, data)).rejects.toThrow(TypeError);
    });
  });

  describe("atomicity guarantees", () => {
    it("should produce valid file even with concurrent writes to different files", async () => {
      // Note: Concurrent writes to the SAME file path is inherently unsafe.
      // This test verifies concurrent writes to DIFFERENT files work correctly.
      const writes = Array.from({ length: 10 }, (_, i) => {
        const filePath = join(tempDir, `concurrent-${i}.json`);
        return atomicWriteJSON(filePath, { iteration: i });
      });

      await Promise.all(writes);

      // All files should be valid JSON
      for (let i = 0; i < 10; i++) {
        const filePath = join(tempDir, `concurrent-${i}.json`);
        const content = await readFile(filePath, "utf8");
        const parsed = JSON.parse(content);
        expect(parsed.iteration).toBe(i);
      }
    });

    it("should not corrupt file with rapid sequential writes", async () => {
      const filePath = join(tempDir, "rapid.json");

      for (let i = 0; i < 20; i++) {
        await atomicWriteJSON(filePath, { count: i });
      }

      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.count).toBe(19);
    });
  });
});

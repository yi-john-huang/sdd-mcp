import { SteeringContextLoader } from "../../application/services/SteeringContextLoader";
import { FileSystemPort, LoggerPort } from "../../domain/ports";
import { SteeringContext } from "../../domain/types";

describe("SteeringContextLoader", () => {
  let loader: SteeringContextLoader;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockLogger: jest.Mocked<LoggerPort>;

  beforeEach(() => {
    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      mkdir: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
    } as jest.Mocked<FileSystemPort>;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as jest.Mocked<LoggerPort>;

    loader = new SteeringContextLoader(mockFileSystem, mockLogger);
  });

  describe("loadContext", () => {
    it("should return default context when projectPath is null", async () => {
      const result = await loader.loadContext();

      expect(result).toEqual({
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      });
      expect(mockFileSystem.exists).not.toHaveBeenCalled();
    });

    it("should return default context when projectPath is undefined", async () => {
      const result = await loader.loadContext(undefined);

      expect(result).toEqual({
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      });
    });

    it("should load product.md and detect hasProductContext", async () => {
      const projectPath = "/test/project";
      const productContent = "a".repeat(250); // > 200 chars

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(productContent);

      const result = await loader.loadContext(projectPath);

      expect(mockFileSystem.exists).toHaveBeenCalledWith(
        `${projectPath}/.spec/steering/product.md`,
      );
      expect(result.hasProductContext).toBe(true);
    });

    it("should load tech.md and detect hasTechContext", async () => {
      const projectPath = "/test/project";
      const techContent = "a".repeat(250); // > 200 chars

      mockFileSystem.exists.mockImplementation((path) => {
        if (path.includes("tech.md")) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      mockFileSystem.readFile.mockResolvedValue(techContent);

      const result = await loader.loadContext(projectPath);

      expect(mockFileSystem.exists).toHaveBeenCalledWith(
        `${projectPath}/.spec/steering/tech.md`,
      );
      expect(result.hasTechContext).toBe(true);
    });

    it("should detect target users pattern in product.md", async () => {
      const projectPath = "/test/project";
      const productContent =
        "This is for target users including developers. ".repeat(5);

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(productContent);

      const result = await loader.loadContext(projectPath);

      expect(result.hasProductContext).toBe(true);
      expect(result.hasTargetUsers).toBe(true);
    });

    it("should not detect target users when pattern not present", async () => {
      const projectPath = "/test/project";
      const productContent =
        "Product description without user patterns. ".repeat(10);

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(productContent);

      const result = await loader.loadContext(projectPath);

      expect(result.hasProductContext).toBe(true);
      expect(result.hasTargetUsers).toBe(false);
    });

    it("should handle missing files gracefully", async () => {
      const projectPath = "/test/project";

      mockFileSystem.exists.mockResolvedValue(false);

      const result = await loader.loadContext(projectPath);

      expect(result).toEqual({
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      });
    });

    it("should handle file read errors without throwing", async () => {
      const projectPath = "/test/project";

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockRejectedValue(new Error("Read error"));

      const result = await loader.loadContext(projectPath);

      expect(result).toEqual({
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      });
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it("should return defaults on complete failure", async () => {
      const projectPath = "/test/project";

      mockFileSystem.exists.mockRejectedValue(new Error("File system error"));

      const result = await loader.loadContext(projectPath);

      expect(result).toEqual({
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should check content length threshold (200 chars)", async () => {
      const projectPath = "/test/project";

      // Short content (< 200)
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue("Short content");

      const result = await loader.loadContext(projectPath);

      expect(result.hasProductContext).toBe(false);
      expect(result.hasTechContext).toBe(false);
    });

    it("should load both product.md and tech.md independently", async () => {
      const projectPath = "/test/project";
      const productContent = "a".repeat(250);
      const techContent = "b".repeat(250);

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockImplementation((path) => {
        if (path.includes("product.md")) return Promise.resolve(productContent);
        if (path.includes("tech.md")) return Promise.resolve(techContent);
        return Promise.resolve("");
      });

      const result = await loader.loadContext(projectPath);

      expect(result.hasProductContext).toBe(true);
      expect(result.hasTechContext).toBe(true);
    });

    it("should continue loading tech.md even if product.md fails", async () => {
      const projectPath = "/test/project";
      const techContent = "a".repeat(250);

      mockFileSystem.exists.mockImplementation((path) => {
        if (path.includes("tech.md")) return Promise.resolve(true);
        if (path.includes("product.md")) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      mockFileSystem.readFile.mockImplementation((path) => {
        if (path.includes("product.md"))
          return Promise.reject(new Error("Product read error"));
        if (path.includes("tech.md")) return Promise.resolve(techContent);
        return Promise.resolve("");
      });

      const result = await loader.loadContext(projectPath);

      expect(result.hasProductContext).toBe(false);
      expect(result.hasTechContext).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Failed to load product.md",
        expect.any(Object),
      );
    });

    it("should log appropriate error levels", async () => {
      const projectPath = "/test/project";

      // Individual file error = debug
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockRejectedValue(new Error("Read error"));

      await loader.loadContext(projectPath);

      expect(mockLogger.debug).toHaveBeenCalled();

      // Complete failure = warn
      mockLogger.debug.mockClear();
      mockLogger.warn.mockClear();
      mockFileSystem.exists.mockRejectedValue(new Error("System error"));

      await loader.loadContext(projectPath);

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});

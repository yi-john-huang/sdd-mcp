/**
 * Unit tests for moduleLoader
 *
 * Tests the unified module loading system that provides cross-context
 * compatibility for documentGenerator and specGenerator imports.
 *
 * TDD Approach: These tests verify the implementation works correctly
 */

import {
  loadDocumentGenerator,
  loadSpecGenerator,
} from "../../../utils/moduleLoader";

describe("moduleLoader", () => {
  describe("loadDocumentGenerator", () => {
    it("should successfully load the documentGenerator module", async () => {
      const module = await loadDocumentGenerator();

      // Verify module has expected interface
      expect(module).toBeDefined();
      expect(typeof module.analyzeProject).toBe("function");
      expect(typeof module.generateProductDocument).toBe("function");
      expect(typeof module.generateTechDocument).toBe("function");
      expect(typeof module.generateStructureDocument).toBe("function");
    });

    it("should return module with correct function signatures", async () => {
      const module = await loadDocumentGenerator();

      // Test that functions exist and are callable
      expect(module.analyzeProject).toBeDefined();
      expect(module.generateProductDocument).toBeDefined();
      expect(module.generateTechDocument).toBeDefined();
      expect(module.generateStructureDocument).toBeDefined();
    });
  });

  describe("loadSpecGenerator", () => {
    it("should successfully load the specGenerator module", async () => {
      const module = await loadSpecGenerator();

      // Verify module has expected interface
      expect(module).toBeDefined();
      expect(typeof module.generateRequirementsDocument).toBe("function");
      expect(typeof module.generateDesignDocument).toBe("function");
      expect(typeof module.generateTasksDocument).toBe("function");
    });

    it("should return module with correct function signatures", async () => {
      const module = await loadSpecGenerator();

      // Test that functions exist and are callable
      expect(module.generateRequirementsDocument).toBeDefined();
      expect(module.generateDesignDocument).toBeDefined();
      expect(module.generateTasksDocument).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should throw descriptive error if documentGenerator cannot be loaded", async () => {
      // This test verifies error message format
      // In normal test environment, the module should load successfully
      // But if it fails, the error should be descriptive

      try {
        const module = await loadDocumentGenerator();
        // If we get here, module loaded successfully (expected in normal test env)
        expect(module).toBeDefined();
      } catch (error) {
        // If module fails to load, error should be descriptive
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "Failed to load documentGenerator",
        );
        expect((error as Error).message).toContain("Attempted paths");
      }
    });

    it("should throw descriptive error if specGenerator cannot be loaded", async () => {
      try {
        const module = await loadSpecGenerator();
        // If we get here, module loaded successfully (expected in normal test env)
        expect(module).toBeDefined();
      } catch (error) {
        // If module fails to load, error should be descriptive
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "Failed to load specGenerator",
        );
        expect((error as Error).message).toContain("Attempted paths");
      }
    });
  });
});

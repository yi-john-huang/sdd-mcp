/**
 * Unit tests for specGenerator
 *
 * Tests the task generation with TDD/principles governance enforcement
 */

import { generateTasksDocument } from "../../../utils/specGenerator";

// Mock documentGenerator to avoid file system dependencies
jest.mock("../../../utils/documentGenerator", () => ({
  analyzeProject: jest.fn().mockResolvedValue({
    name: "test-project",
    description: "Test project for spec generation",
    version: "1.0.0",
    type: "mcp-server",
    architecture: "MCP SDK",
    dependencies: ["@modelcontextprotocol/sdk"],
    devDependencies: ["jest", "typescript"],
    scripts: { test: "jest", build: "tsc" },
    directories: ["src", "dist"],
    files: [],
    hasTests: true,
    hasDocker: false,
    hasCI: false,
    framework: "MCP SDK",
    language: "typescript",
    testFramework: "Jest",
    buildTool: "TypeScript",
    packageManager: "npm",
  }),
}));

describe("specGenerator", () => {
  describe("generateTasksDocument", () => {
    it("should generate tasks document with TDD phases", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      expect(result).toContain("# Implementation Plan (TDD Approach)");
      expect(result).toContain("🔴 RED (Failing Tests)");
      expect(result).toContain("🟢 GREEN (Passing Implementation)");
      expect(result).toContain("🔵 REFACTOR (Code Quality)");
    });

    it("should reference tdd-guideline.md in tasks", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      expect(result).toContain(".kiro/steering/tdd-guideline.md");
    });

    it("should include governance subtasks in every task group", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      // Check that TDD guidance subtask appears (should appear multiple times - once per task)
      const tddMatches = result.match(
        /Follow `\.kiro\/steering\/tdd-guideline\.md` \(Red→Green→Refactor\)/g
      );
      expect(tddMatches).not.toBeNull();
      expect(tddMatches!.length).toBeGreaterThan(3); // Should appear in multiple tasks

      // Check that principles subtask appears
      const principlesMatches = result.match(
        /Review `\.kiro\/steering\/principles\.md`; capture any deviations/g
      );
      expect(principlesMatches).not.toBeNull();
      expect(principlesMatches!.length).toBeGreaterThan(3); // Should appear in multiple tasks
    });

    it("should include TDD and Principles in requirements tags", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      // Should have multiple occurrences of TDD and Principles in requirements
      expect(result).toContain("TDD, Principles");
    });

    it("should include all four TDD phases", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      // Phase 1: Test Setup
      expect(result).toContain("## Phase 1: Test Setup");
      expect(result).toContain("Set up test infrastructure");
      expect(result).toContain("Write failing tests");

      // Phase 2: Implementation
      expect(result).toContain("## Phase 2: Implementation");
      expect(result).toContain("Set up project scaffolding");
      expect(result).toContain("Implement minimal code to pass tests");

      // Phase 3: Refactoring
      expect(result).toContain("## Phase 3: Refactoring");
      expect(result).toContain("Refactor for code quality");

      // Phase 4: Integration
      expect(result).toContain("## Phase 4: Integration & Documentation");
      expect(result).toContain("Integration with existing system");
    });

    it("should include framework-specific tasks when MCP SDK detected", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      // MCP-specific tasks should be included
      expect(result).toContain("MCP tool handlers");
      expect(result).toContain("stdio transport");
    });

    it("should generate valid markdown structure", async () => {
      const result = await generateTasksDocument("/test/path", "test-feature");

      // Check basic markdown structure
      expect(result).toContain("# Implementation Plan");
      expect(result).toContain("##"); // Should have sections
      expect(result).toContain("- [ ]"); // Should have checkboxes
    });
  });
});

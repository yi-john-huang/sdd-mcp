# Legacy Test Suites

The folders in this directory capture the original end-to-end, infrastructure, and validation suites that shipped with earlier releases of the SDD MCP server. They currently depend on APIs and scaffolding that have since been refactored, so they no longer compile cleanly under the latest TypeScript configuration.

The primary Jest configuration now targets `src/__tests__/unit`, where new TDD-focused coverage lives. When you're ready to revive any of the archived suites, migrate the relevant cases into the modern structure, update the mocks to match the current DI container, and add them back to the active roots in `jest.config.js`.

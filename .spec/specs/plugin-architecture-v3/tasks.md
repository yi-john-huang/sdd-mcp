# Implementation Tasks: Plugin Architecture v3.0

## TDD Implementation Guidelines

For each task:
1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping tests green

Reference: `.spec/steering/tdd-guideline.md` and `.spec/steering/principles.md`

---

## Implementation Status: ✅ COMPLETE

**Completed:** 2026-01-24
**Total Tests:** 199 (58 new tests for component managers)
**Test Suites:** 18 passed

---

## Sprint 1: Foundation (Rules + Contexts) ✅

### Task 1.1: Create RulesManager with Tests ✅
**Status:** Complete
**Tests:** 13 passing

**Completed Steps:**
- [x] Created test file `src/__tests__/unit/rules/RulesManager.test.ts`
- [x] Wrote tests for `listComponents()`, `parseMetadata()`, `installComponents()`
- [x] Created `src/rules/RulesManager.ts` extending BaseManager
- [x] Implemented `parseMetadata()` for RuleDescriptor with priority and alwaysActive
- [x] Added `listByPriority()` and `listActiveRules()` methods
- [x] All tests pass

**Files Created:**
- `src/rules/RulesManager.ts`
- `src/rules/index.ts`
- `src/__tests__/unit/rules/RulesManager.test.ts`

### Task 1.2: Create ContextManager with Tests ✅
**Status:** Complete
**Tests:** 14 passing

**Completed Steps:**
- [x] Created test file `src/__tests__/unit/contexts/ContextManager.test.ts`
- [x] Wrote tests for `listComponents()`, `parseMetadata()`, `installComponents()`
- [x] Created `src/contexts/ContextManager.ts` extending BaseManager
- [x] Implemented `parseMetadata()` for ContextDescriptor with mode
- [x] Added `getContextByMode()` and `listModes()` methods
- [x] All tests pass

**Files Created:**
- `src/contexts/ContextManager.ts`
- `src/contexts/index.ts`
- `src/__tests__/unit/contexts/ContextManager.test.ts`

### Task 1.3: Create Rule Definition Files ✅
**Status:** Complete

**Files Created:**
- `rules/coding-style.md` - TypeScript/JavaScript coding conventions
- `rules/testing.md` - Testing requirements and TDD patterns
- `rules/security.md` - Security best practices (OWASP aligned)
- `rules/git-workflow.md` - Git commit and branching rules
- `rules/error-handling.md` - Error handling patterns
- `rules/sdd-workflow.md` - SDD process rules

### Task 1.4: Create Context Definition Files ✅
**Status:** Complete

**Files Created:**
- `contexts/dev.md` - Development/implementation mode
- `contexts/review.md` - Code review mode
- `contexts/planning.md` - Planning/architecture mode
- `contexts/security-audit.md` - Security audit mode
- `contexts/research.md` - Research/exploration mode

### Task 1.5: Update DI Container for Sprint 1 ✅
**Status:** Complete

**Completed Steps:**
- [x] Added `RulesManager` and `ContextManager` symbols to `types.ts`
- [x] Registered managers in `container.ts` with `toDynamicValue()` and singleton scope
- [x] Added path resolution using package root detection

---

## Sprint 2: Agents ✅

### Task 2.1: Create AgentManager with Tests ✅
**Status:** Complete
**Tests:** 13 passing

**Completed Steps:**
- [x] Created test file `src/__tests__/unit/agents/AgentManager.test.ts`
- [x] Wrote tests for `listComponents()`, `parseMetadata()`, `installComponents()`
- [x] Created `src/agents/AgentManager.ts` extending BaseManager
- [x] Implemented `parseMetadata()` for AgentDescriptor with role and expertise
- [x] Added `getAgentByRole()`, `listRoles()`, and `findByExpertise()` methods
- [x] All tests pass

**Files Created:**
- `src/agents/AgentManager.ts`
- `src/agents/index.ts`
- `src/__tests__/unit/agents/AgentManager.test.ts`

### Task 2.2: Create Agent Definition Files ✅
**Status:** Complete

**Files Created:**
- `agents/planner.md` - Planning and roadmap agent
- `agents/architect.md` - System design and architecture agent
- `agents/reviewer.md` - Code review agent (Linus-style)
- `agents/implementer.md` - Implementation-focused agent
- `agents/security-auditor.md` - Security review agent
- `agents/tdd-guide.md` - TDD coaching agent

### Task 2.3: Update DI Container for Sprint 2 ✅
**Status:** Complete (merged with Task 1.5)

---

## Sprint 3: Hooks ✅

### Task 3.1: Create HookLoader with Tests ✅
**Status:** Complete
**Tests:** 18 passing

**Completed Steps:**
- [x] Created test file `src/__tests__/unit/hooks/HookLoader.test.ts`
- [x] Wrote tests for nested directory structure scanning
- [x] Wrote tests for event type inference from directory name
- [x] Created `src/hooks/HookLoader.ts` extending BaseManager
- [x] Overrode `listComponents()` to handle nested `hooks/{event-type}/*.md` structure
- [x] Implemented `getHooksByEvent()`, `listEventTypes()`, `getEnabledHooks()`
- [x] All tests pass

**Files Created:**
- `src/hooks/HookLoader.ts`
- `src/__tests__/unit/hooks/HookLoader.test.ts`

### Task 3.2: Create Hook Directory Structure ✅
**Status:** Complete

**Directories Created:**
- `hooks/pre-tool-use/`
- `hooks/post-tool-use/`
- `hooks/session-start/`
- `hooks/session-end/`

**Hook Files Created:**
- `hooks/pre-tool-use/validate-sdd-workflow.md` - Validates SDD workflow phase order
- `hooks/pre-tool-use/check-test-coverage.md` - TDD reminder for new code
- `hooks/post-tool-use/update-spec-status.md` - Auto-updates spec.json
- `hooks/post-tool-use/log-tool-execution.md` - Audit logging (disabled by default)
- `hooks/session-start/load-project-context.md` - Loads steering and project state
- `hooks/session-end/save-session-summary.md` - Saves session notes for continuity
- `hooks/session-end/remind-uncommitted-changes.md` - Git status reminder

### Task 3.3: Update DI Container for Sprint 3 ✅
**Status:** Complete (merged with Task 1.5)

---

## Sprint 4: New Skills ✅

### Task 4.1: Create sdd-review Skill ✅
**Status:** Complete

**Files Created:**
- `skills/sdd-review/SKILL.md`

**Features:**
- Linus-style direct code review methodology
- Severity levels: 🚨 Must Fix, ⚠️ Should Fix, 💡 Suggestions
- Correctness, simplicity, and maintainability focus
- Integration with project steering documents

### Task 4.2: Create sdd-security-check Skill ✅
**Status:** Complete

**Files Created:**
- `skills/sdd-security-check/SKILL.md`

**Features:**
- OWASP Top 10 (2021) checklist coverage
- All 10 categories: A01-A10
- Quick security checklist for deployments
- Integration with SDD workflow

### Task 4.3: Create sdd-test-gen Skill ✅
**Status:** Complete

**Files Created:**
- `skills/sdd-test-gen/SKILL.md`

**Features:**
- TDD workflow guidance (Red-Green-Refactor)
- Test categories: unit, edge cases, error handling, integration
- Framework detection (Jest, Vitest, Mocha, Pytest)
- Coverage targets and best practices

---

## Sprint 5: CLI + Integration ✅

### Task 5.1: Update Unified Install CLI ✅
**Status:** Complete
**Tests:** 23 passing (updated from 14)

**Completed Steps:**
- [x] Imported all new managers (Rules, Context, Agent, HookLoader)
- [x] Added CLI flags: `--rules`, `--contexts`, `--agents`, `--hooks`, `--all`
- [x] Updated `--list` to show all 6 component types
- [x] Updated help text for unified install
- [x] Fixed `import.meta.url` issue for Jest compatibility using package root detection
- [x] Maintained backward compatibility with existing flags

**Files Updated:**
- `src/cli/install-skills.ts`
- `src/__tests__/unit/cli/install-skills.test.ts`

### Task 5.2: Create Plugin Manifest ✅
**Status:** Complete

**Files Created:**
- `.claude-plugin/plugin.json`

**Contents:**
- Plugin metadata (name, version, description)
- MCP server configuration
- All 6 component types with paths and items
- Full tool listing (15 MCP tools)
- Installation command documentation

### Task 5.3: Update Documentation ✅
**Status:** Complete

**Files Updated:**
- `README.md` - v3.0 features, new component types, updated CLI docs
- `.spec/specs/plugin-architecture-v3/spec.json` - Marked implementation complete
- `.spec/specs/plugin-architecture-v3/tasks.md` - This file

---

## Verification Checklist ✅

### Unit Tests
- [x] `npm test -- --grep "RulesManager"` passes (13 tests)
- [x] `npm test -- --grep "ContextManager"` passes (14 tests)
- [x] `npm test -- --grep "AgentManager"` passes (13 tests)
- [x] `npm test -- --grep "HookLoader"` passes (18 tests)
- [x] `npm test -- --grep "install"` passes (23 tests)
- [x] All 199 tests pass

### Integration
- [x] Component managers properly extend BaseManager
- [x] DI container registers all managers with singleton scope
- [x] CLI handles all 6 component types

### Backward Compatibility
- [x] All 8 existing skills still work (+ 3 new = 11 total)
- [x] Existing steering documents unaffected
- [x] Original CLI flags continue to work

---

## Summary

| Sprint | Tasks | Status |
|--------|-------|--------|
| 1: Foundation | 5 tasks | ✅ Complete |
| 2: Agents | 3 tasks | ✅ Complete |
| 3: Hooks | 3 tasks | ✅ Complete |
| 4: New Skills | 3 tasks | ✅ Complete |
| 5: CLI + Integration | 3 tasks | ✅ Complete |
| **Total** | **17 tasks** | **✅ All Complete** |

**Implementation completed following TDD methodology with 199 passing tests.**

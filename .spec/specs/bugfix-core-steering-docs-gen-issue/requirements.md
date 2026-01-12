# Requirements Document

## Introduction
**Feature**: bugfix-core-steering-docs-gen-issue  
**Project**: `sdd-mcp-server` – MCP server powering spec-driven development automation.  
**Problem**: When the server is started from the TypeScript sources (e.g., `npm run dev`, `tsx src/index.ts`, local MCP sandbox launches), every “core document” command (`sdd-steering`, `sdd-requirements`, `sdd-design`, `sdd-tasks`) skips real code analysis and emits the hard-coded fallback templates. In addition, generated task lists never include the mandated steps to follow `tdd-guideline.md` and `principles.md`.

**Bug Context**
- `src/utils/moduleLoader.ts` only attempts `.js` relative paths such as `./utils/documentGenerator.js`. When this file executes from the TypeScript tree, those `.js` artifacts do not exist, so the loader throws after exhausting the JS-only paths.
- `handleSteeringSimplified`, `handleRequirementsSimplified`, `handleDesignSimplified`, and `handleTasksSimplified` (see `src/index.ts` around lines 380‑1500) all rely on `loadDocumentGenerator`/`loadSpecGenerator`. When the loader fails, each handler catches the error and returns generic templates with a warning message—hence no project-derived content is ever produced.
- `specGenerator.js` (`generateImplementationTasks`) never references steering guardrails, so even when analysis succeeds, the resulting `tasks.md` omits the required “follow TDD guidance” and “review coding principles” subtasks that the steering documents demand.

**Impact**
- Agents cannot trust steering, requirements, design, or tasks because they do not reflect the real repository.
- Teams running the server via `tsx`/`npm run dev` or inside IDE MCP hosts are forced into manual editing.
- Lack of explicit TDD/principle checkpoints in `tasks.md` breaks the enforced workflow described in `.kiro/steering/tdd-guideline.md` and `principles.md`.

## Current vs Expected Behavior

| Scenario | Current Behavior | Expected Behavior |
| --- | --- | --- |
| `npm run dev` or `tsx src/index.ts` then `sdd-steering` | `loadDocumentGenerator()` fails to find `.js` entry, `handleSteeringSimplified` falls back to stub template content | Loader detects source-layout paths (TypeScript) and generates product/tech/structure from actual analysis |
| `sdd-requirements/design/tasks` in dev mode | `loadSpecGenerator()` can’t import `.js`, every document becomes template with warning | Requirements/design/tasks use `specGenerator` outputs derived from `analyzeProject`, regardless of execution context |
| Generated `tasks.md` | Contains high-level tasks (“Set up scaffolding”, “Add tests”) but no explicit TDD/principles guardrails | Every task block must include subtasks to execute TDD workflow and run a “review code principles” checklist referencing steering docs |

## Root Cause Analysis
1. **ModuleLoader JS-only fallback** – `loadDocumentGenerator`/`loadSpecGenerator` hard-code path attempts (`'./utils/*.js'`, `'../utils/*.js'`, etc.). When running from TypeScript, only `.ts` modules exist and none of the attempts succeed. There is no logic to resolve the package root via `import.meta.url` or to try `.ts` extensions.
2. **Handlers swallow loader errors** – In `src/index.ts` the simplified handlers catch any loader/import failure and immediately fall back to the template strings; they do not surface actionable errors nor retry with alternate paths.
3. **Tasks generator lacks governance hooks** – `generateImplementationTasks` (root `specGenerator.js` and compiled twin in `dist/utils/`) never injects TDD or principle steps, contradicting the steering mandate to apply `.kiro/steering/tdd-guideline.md` and `principles.md`.

## Functional Requirements

### FR-1: Cross-context Module Resolution
1. WHEN any loader function is invoked in dev or prod mode THEN it SHALL resolve the module by iterating both `.js` and `.ts` variants.
2. WHEN executing from TypeScript sources THEN loader SHALL derive absolute paths via `fileURLToPath(import.meta.url)` so that `../documentGenerator.ts` resolves correctly.
3. IF no candidate path succeeds THEN loader SHALL throw an error listing every attempted absolute path.

### FR-2: Reliable Document Generation Commands
1. WHEN `sdd-steering`, `sdd-requirements`, `sdd-design`, or `sdd-tasks` run in any context (npx, npm, node, tsx, IDE MCP) THEN they SHALL always use the analyzed content produced by `documentGenerator`/`specGenerator`.
2. IF loading fails THEN the command SHALL include the loader error in the MCP response and instruct the operator to fix the environment instead of silently writing template docs.
3. WHILE fallbacks exist, THEY SHALL only be used when the user explicitly opts-in (e.g., `--allow-template-fallback`) or after logging a critical error to stderr.

### FR-3: Enhanced Logging & Telemetry
1. WHEN loader retries paths THEN it SHALL emit `[SDD-DEBUG] Attempt X/Y: <path>` so operators know which path eventually succeeded.
2. WHEN a fallback template is produced THEN the handler SHALL include a pointer to troubleshooting steps (e.g., “run npm run build to produce dist/utils/documentGenerator.js”).

### FR-4: Task Checklist Enforcement
1. WHEN `generateTasksDocument` builds each task group (development, integration, quality, deployment) THEN it SHALL append two subtasks:
   - “Follow `.kiro/steering/tdd-guideline.md` before writing code (red-green-refactor).”
   - “Review `.kiro/steering/principles.md` and document deviations.”
2. WHERE tasks already contain subtasks, THESE new subtasks SHALL either be explicit bullet items or dedicated checklist items so they cannot be skipped.
3. WHEN tasks reference requirements THEN they SHALL also reference the governance documents (e.g., `requirements: "FR-1, TDD, Principles"`).

### FR-5: Regression Coverage
1. WHEN module loader paths change THEN unit tests under `src/__tests__/unit/utils/moduleLoader.test.ts` SHALL cover TypeScript + JavaScript contexts.
2. WHEN task generation changes THEN add/extend tests verifying the new TDD/principle subtasks exist in every section.

## Non-Functional Requirements
- **Performance**: Module loading retries SHALL complete within 150 ms even with four path attempts; document generation end-to-end SHALL remain ≤5 s on the current repository.
- **Reliability**: Commands SHALL fail fast with actionable errors instead of silently writing templates; fallback templates are last resort only.
- **Maintainability**: Loader path list MUST be centralized (single source) to avoid drift between dev/prod; new task subtasks SHALL be configurable constants to keep steering docs and code in sync.
- **Security**: No dynamic `eval` or untrusted path resolution; path attempts must stay within the package boundary to avoid loading arbitrary code.

## Acceptance Criteria (EARS)
1. **WHEN** the MCP server runs via `npm run dev` **THEN** `sdd-steering` SHALL log the successful module path and write analyzed product/tech/structure docs.  
2. **WHEN** `sdd-requirements bugfix-core-steering-docs-gen-issue` executes in the same context **THEN** the generated `requirements.md` SHALL include actual dependency information (not the fallback warning).  
3. **WHEN** any tasks document is generated **THEN** every task group SHALL contain “Follow TDD guidance” and “Review coding principles” checklist items referencing `.kiro/steering`.  
4. **IF** loader resolution fails **THEN** the CLI response SHALL surface the error message and all attempted paths so the operator can remediate.  
5. **WHILE** running via `npx sdd-mcp` **WHERE** dist artifacts exist **THEN** behavior remains unchanged (no regressions).

## Out of Scope
- Redesigning `documentGenerator`/`specGenerator` analysis heuristics.
- Changing MCP tool schemas or adding new commands.
- Editing `.kiro/steering` content beyond referencing it inside tasks.

## Dependencies & Constraints
- Requires updates to `src/utils/moduleLoader.ts`, `src/index.ts`, and both `specGenerator.js` variants (root + dist).
- Must continue working with the published npm tarball (`files` list) and CI build outputs.

## Success Metrics
1. Manual reproduction steps show analyzed documents in dev, prod, and IDE contexts.
2. Unit tests cover both TypeScript and JavaScript loader paths.
3. QA review confirms every generated task includes TDD/principle subtasks without manual editing.

Generated on: 2025-11-07T14:07:28Z

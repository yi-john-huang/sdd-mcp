# Technical Design Document

## 1. Overview
- **Feature**: bugfix-core-steering-docs-gen-issue  
- **Objective**: Ensure every steering/requirements/design/tasks command performs genuine project analysis in any execution context (dist build, tsx dev server, IDE MCP host) and force task plans to include explicit TDD + coding-principle checkpoints.
- **Scope**:
  - Robust module loading in `src/utils/moduleLoader.ts`.
  - Error handling/logging in simplified MCP handlers inside `src/index.ts`.
  - `specGenerator` task output (TypeScript source + compiled dist + root JS shim).
  - New/updated Jest coverage.
- **Out of Scope**: Changing generator heuristics, altering steering document content, or extending MCP tool schemas.

## 2. Current State & Pain Points
1. **Module loader** only tries `.js` relatives (e.g., `./utils/documentGenerator.js`). In dev mode (`tsx src/index.ts`) those files do not exist yet, so all attempts fail and the loader throws.
2. **Simplified handlers** catch the loader failure and immediately write fallback templates (product/tech/structure placeholders, requirements/design/tasks stubs). Operators never see the error unless they inspect stderr.
3. **Task generator** already structures work into TDD phases but the actual checklist items make no mention of `.kiro/steering/tdd-guideline.md` or `principles.md`, so the mandated governance can be ignored even when analysis succeeds.

## 3. Proposed Architecture Changes

### 3.1 Cross-context Module Resolution
| Requirement | Design Decision |
| --- | --- |
| Support both `src/` and `dist/` layouts | Derive absolute directories via `fileURLToPath(import.meta.url)` so code knows where it lives. |
| Try both TS and JS artifacts | Build candidate paths with extension list `['.ts', '.js', '.mjs', '.cjs']`. |
| Provide actionable errors | Collect every failed attempt and emit them in the thrown error. |

**Implementation Outline (`src/utils/moduleLoader.ts`):**
```typescript
const EXTENSIONS = [".ts", ".js", ".mjs", ".cjs"];

function computeBasePaths(target: string) {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));   // .../src/utils or .../dist/utils
  const parentDir = path.dirname(moduleDir);                        // .../src or .../dist
  const projectRoot = path.dirname(parentDir);                      // repo root or npm package root
  const distDir = path.join(projectRoot, "dist");
  return [
    { dir: moduleDir, rel: target },               // ./documentGenerator
    { dir: moduleDir, rel: `utils/${target}` },    // ./utils/documentGenerator
    { dir: parentDir, rel: target },               // ../documentGenerator (src)
    { dir: parentDir, rel: `utils/${target}` },    // ../utils/documentGenerator (dist build)
    { dir: projectRoot, rel: target },             // root-level shim
    { dir: distDir, rel: `utils/${target}` }       // dist/utils when run from project root
  ];
}

async function loadModule(target: "documentGenerator" | "specGenerator") {
  const attempts = [];
  for (const base of computeBasePaths(target)) {
    for (const ext of EXTENSIONS) {
      const fullPath = path.resolve(base.dir, `${base.rel}${ext}`);
      attempts.push(fullPath);
      try {
        console.error(`[SDD-DEBUG] ModuleLoader attempting: ${fullPath}`);
        return await import(pathToFileURL(fullPath).href);
      } catch (err) {
        errors.push(`${fullPath}: ${(err as Error).message}`);
      }
    }
  }
  throw new Error(`Failed to load ${target}. Tried:\n${errors.join("\n")}`);
}
```
`loadDocumentGenerator` and `loadSpecGenerator` become thin wrappers around `loadModule`.

### 3.2 Handler Error Strategy (`src/index.ts`)
1. Introduce `const allowFallback = process.env.SDD_ALLOW_TEMPLATE_FALLBACK === "true" || args?.allowFallback === true;`.
2. On loader failure:
   - If `allowFallback` is **false** → propagate an MCP error (no file writes) containing the aggregated loader message so the user fixes their build.
   - If `allowFallback` is **true** → reuse the existing fallback templates but prepend an HTML comment plus console warning instructing users to run `npm run build`.
3. Extract a shared helper:
   ```typescript
   function handleLoaderFailure(context: string, error: Error, allowFallback: boolean) { ... }
   ```
   This helper returns either `{ fallbackContent, analysisUsed: false }` or throws.
4. Keep `[SDD-DEBUG]` logging consistent; on success log the resolved path (loader already prints).

### 3.3 Task Checklist Enforcement (`src/utils/specGenerator.ts`)
1. Add constants:
   ```typescript
   const TDD_SUBTASK = "Follow `.kiro/steering/tdd-guideline.md` (Red→Green→Refactor)";
   const PRINCIPLES_SUBTASK = "Review `.kiro/steering/principles.md`; capture any deviations";
   ```
2. Helper to decorate tasks:
   ```typescript
   function enforceGovernance(tasks: Task[]): Task[] {
     return tasks.map(task => {
       if (!task.subtasks.includes(TDD_SUBTASK)) task.subtasks.push(TDD_SUBTASK);
       if (!task.subtasks.includes(PRINCIPLES_SUBTASK)) task.subtasks.push(PRINCIPLES_SUBTASK);
       if (!/TDD|Principles/.test(task.requirements)) {
         task.requirements = `${task.requirements}, TDD, Principles`;
       }
       return task;
     });
   }
   ```
3. After building `testSetup`, `implementation`, `refactoring`, `integration` arrays apply `enforceGovernance()`.
4. Run `npm run build` so `dist/utils/specGenerator.js` and shipped root `specGenerator.js` inherit the same behavior.

### 3.4 Distribution / Packaging
- Because `dist/` is published, implementation must include `npm run build` and commit the updated transpiled files (moduleLoader, specGenerator, index).
- Update `CHANGELOG.md` to describe the behavioral change (fallback now opt-in, new task subtasks).
- Document the new `SDD_ALLOW_TEMPLATE_FALLBACK` flag in `README.md`.

## 4. Data & Control Flow
1. **Steering/Spec Command** → handler runs → loader resolves module via new absolute-path logic → generator produces analysis-based content → files written.
2. **Error Path** → loader exhausts candidates → helper throws aggregated error → handler bubbles error to MCP client (unless fallback explicitly allowed).
3. **Tasks Generation** → `generateImplementationTasks` builds phases → `enforceGovernance` injects TDD/principle subtasks → `generateTasksDocument` renders them so every checkbox includes governance reminders.

## 5. Testing & Validation
| Test | Description |
| --- | --- |
| Module loader unit tests | Mock `import()` to confirm `.ts` and `.js` candidates succeed, and that failure error lists every path. |
| Handler regression tests | Simulate loader failure (mock `loadSpecGenerator`) to ensure commands now error by default and honor `allowFallback`. |
| Task generation tests | Assert each task contains both governance subtasks and requirement tags. |
| Manual smoke tests | Run `npm run dev` and `npx sdd-mcp` to verify steering + spec docs show analysis results; flip `SDD_ALLOW_TEMPLATE_FALLBACK` to confirm opt-in templates. |

## 6. Risks & Mitigations
- **Risk**: Absolute path math could read outside repo. → Mitigation: limit candidates to known directories relative to `moduleLoader` and log each attempt.
- **Risk**: Users relying on silent templates now see errors. → Provide opt-in flag + clear guidance in error text/README.
- **Risk**: Forgetting to rebuild dist causes inconsistent npm output. → Include build/test steps in tasks + CI check for dirty tree.

## 7. Open Questions
1. Should fallback be allowed per-command flag (e.g., `args.allowFallback`)?  
   - Proposed answer: yes—`args.allowFallback === true` overrides environment so individual CLI calls can request templates.
2. Do we still need the root-level `documentGenerator.js` and `specGenerator.js` when TypeScript sources exist?  
   - Decision deferred; for now keep them synced via build step to avoid breaking published artifacts.

## 8. Implementation Checklist
1. Refactor `moduleLoader` with new resolver + tests.
2. Update simplified handlers to use new error helper + fallback flag.
3. Enhance `specGenerator` tasks with governance subtasks and rebuild dist.
4. Write/extend Jest suites (module loader + spec generator).
5. Run `npm run build && npm run test`.
6. Update docs (`README`, `CHANGELOG`) about fallback flag and new task contents.

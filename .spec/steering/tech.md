# Technology Overview

## Stack

### Language and Runtime
- **Primary language:** TypeScript 5.x
- **Runtime:** Node.js >= 18
- **Module system:** ESM (`"type": "module"`)
- **Build target:** ES2022
- **Package manager:** npm with `package-lock.json`

### Core Frameworks and Protocols
- **Model Context Protocol SDK:** One compiled stdio server with an exact 16-tool v5 integrator contract.
- **Inversify:** Dependency injection container for clean architecture wiring.
- **Handlebars:** Template rendering for generated documents and project artifacts.
- **AJV and Zod:** Runtime validation for schemas and structured input.
- **i18next:** Localization infrastructure.
- **Jest and ts-jest:** Unit testing for TypeScript ESM modules.

### Key Dependencies
| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server integration and protocol types |
| `inversify` + `reflect-metadata` | Dependency injection for application and infrastructure services |
| `handlebars` | Template rendering and document generation |
| `ajv` + `ajv-formats` | JSON schema validation |
| `zod` | Structured schema definitions and validation |
| `@babel/parser`, `acorn`, `esprima`, `typescript-estree` | Source parsing and quality/codebase analysis |
| `i18next` packages | Localization services |
| `uuid` | Stable IDs for projects and workflow objects |
| `write-file-atomic` | Serialized cross-platform replacement for durable specs, handoffs, and install manifests |

## Architecture

### Pattern
The codebase follows a clean architecture / hexagonal style:

```text
src/index.ts, src/cli, src/adapters
  -> presentation and command/tool adapters

src/application/services
  -> workflow orchestration and use cases

src/domain
  -> ports, types, workflow state, quality contracts, plugin contracts

src/infrastructure
  -> MCP server, filesystem/config adapters, DI, schemas, templates, plugins
```

Domain ports live in `src/domain/ports.ts` and are implemented in infrastructure adapters. Application services depend on ports and domain types; `src/infrastructure/di/container.ts` binds concrete implementations with Inversify.

### Main Runtime Paths
- `src/index.ts` is the single compiled MCP server source and exports callable create/start functions.
- Root `sdd-entry.js` and `mcp-server.js` are thin compatibility launchers for the compiled runtime.
- `src/infrastructure/mcp/` owns the exact shared tool definitions, server lifecycle, capability negotiation, and errors.
- `src/adapters/cli/SDDToolAdapter.ts` binds the validated server workspace to disk-authoritative application services.
- `src/cli/install-target.ts` owns three-way target selection, native default paths, role/model routes, and validation.
- `src/cli/tool-support/` contains Claude Code, Codex, and OMP render/install strategies; `src/cli/utils/` contains managed ownership, atomic persistence, and generated-ignore boundaries.
- `src/application/services/ContextCompactionService.ts` handles phase-aware bounded context, SHA-256 fingerprints, ETags, and canonical handoff repair.
- `src/application/services/WorkflowEngineService.ts` treats `.spec/specs/*/spec.json` as workflow authority across server restarts.

### Workflow Responsibility Boundary
- Canonical `skills/sdd-{requirements,design,tasks,implement}/` owns method, artifact composition, concise validation presentation, and explicit human gates.
- `WorkflowEngineService` and MCP adapters own durable feature identity, schema-v5 revisions/hashes, deterministic validation, approval/checkpoint governance, implementation progress, recovery, and handoff publication.
- `.spec/specs/<feature>/spec.json` is authoritative; Markdown artifacts are governed readable content and `context/handoff.md` is rebuildable.
- Target renderers add only native invocation/model metadata. Generated `.claude/`, `.agents/`, `.codex/`, and `.omp/` trees are outputs, not workflow sources.

## Development Environment

### Setup
```bash
npm install
npm run build
npm start
```

### Common Commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | Run `src/index.ts` with `tsx watch` |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm run start` | Run the compiled server |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint over `src/**/*.ts` |
| `npm run test` | Run Jest |
| `npm run test:unit` | Run unit tests only; quote the ignore pattern in zsh if invoking manually |
| `npm run test:coverage` | Generate coverage reports |
| `npm run validate` | Typecheck, lint, and coverage CI test |

### Packaging
- Published package name: `sdd-mcp-server`
- Current version: `5.0.0`
- Binaries:
  - `sdd-mcp-server` -> `sdd-entry.js`
  - `sdd-install-skills` -> `dist/cli/install-skills.js`
  - `context-report` -> `scripts/context-usage-report.mjs`
- Published component directories include `skills`, `steering`, `rules`, `contexts`, `agents`, and `hooks`; templates include native root guidance and supported hook assets.

### Docker
The Docker build is multi-stage:
- `node:18-alpine` builder
- production dependencies stage
- `gcr.io/distroless/nodejs18-debian11` runtime

The production image is intended to run with a minimal attack surface and no shell.

## Quality Standards
- Keep `npm run typecheck` passing before delivery.
- Use focused Jest unit tests for workflow, installer, context, validation, and service behavior.
- Maintain the configured global coverage threshold of 80% for branches, functions, lines, and statements in coverage runs.
- Use existing port/service abstractions before adding new infrastructure dependencies.
- Keep generated or installed local agent components out of source control unless they are source assets under root `skills/`, `rules/`, `contexts/`, `agents/`, `hooks/`, or `steering/`.

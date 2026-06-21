# Project Structure

## Directory Layout

```text
sdd-mcp/
├── src/
│   ├── index.ts                  # Main MCP entry point and simplified stdio mode
│   ├── adapters/cli/             # Tool adapter surface for CLI/MCP calls
│   ├── application/services/     # Use cases and workflow orchestration
│   ├── domain/                   # Types, ports, workflow state, quality/plugin contracts
│   ├── infrastructure/           # MCP server, DI, adapters, schemas, templates, plugins
│   ├── cli/                      # Install and migration CLIs
│   ├── agents/                   # Source managers for installable agents
│   ├── contexts/                 # Source managers for installable contexts
│   ├── hooks/                    # Source managers for installable hooks
│   ├── rules/                    # Source managers for installable rules
│   ├── skills/                   # Source managers for installable skills
│   ├── shared/                   # Shared helpers
│   ├── utils/                    # Utility modules and generators
│   └── __tests__/unit/           # Jest unit tests grouped by domain area
├── skills/                       # Packaged Agent Skill source assets
├── steering/                     # Packaged steering templates
├── rules/                        # Packaged rule components
├── contexts/                     # Packaged context components
├── agents/                       # Packaged agent components
├── hooks/                        # Packaged hook components
├── .spec/steering/               # Project-specific steering documents
├── .spec/specs/                  # SDD feature specs for this repository
├── .claude-plugin/               # Claude plugin manifest
├── dist/                         # TypeScript build output
├── package.json                  # Package metadata, scripts, dependencies, binaries
├── tsconfig.json                 # TypeScript compiler settings
├── jest.config.js                # Jest ESM TypeScript test config
├── Dockerfile                    # Multi-stage distroless production image
└── README.md                     # User-facing usage and release documentation
```

## Source Organization

### Domain Layer
- Keep domain types, ports, workflow state machines, quality contracts, and plugin contracts under `src/domain/`.
- Domain code should not import infrastructure implementations.
- Add new persistence, filesystem, validation, logging, template, or task-tracking boundaries as ports before wiring concrete adapters.

### Application Layer
- Put orchestration and use cases under `src/application/services/`.
- Services should coordinate domain objects and ports, not own transport-specific MCP formatting.
- Favor focused services such as `WorkflowEngineService`, `ProjectService`, `TemplateService`, and `ContextCompactionService` over expanding entrypoint logic.

### Infrastructure Layer
- Put MCP runtime code under `src/infrastructure/mcp/`.
- Put concrete adapters under `src/infrastructure/adapters/`, repositories under `src/infrastructure/repositories/`, schemas under `src/infrastructure/schemas/`, and DI bindings under `src/infrastructure/di/`.
- Register new services and adapters in `src/infrastructure/di/types.ts` and `src/infrastructure/di/container.ts`.

### CLI and Entry Points
- Use `src/index.ts` for MCP server startup and simplified mode compatibility.
- Use `src/cli/` for install and migration commands.
- Keep tool schemas and tool response behavior aligned between full adapter paths and simplified MCP paths when both are supported.

### Packaged Components
- Root `skills/`, `steering/`, `rules/`, `contexts/`, `agents/`, and `hooks/` are package source assets.
- Generated local installs under `.claude/`, `.agents/`, and `.codex/` are project-local outputs and should not be treated as source assets.
- When adding or renaming a component, update package files, installer tests, README tables, and any Codex/Claude conversion outputs as needed.

## Naming Conventions

### Files
| Type | Convention | Example |
|------|------------|---------|
| Services | PascalCase with `Service` suffix | `WorkflowEngineService.ts` |
| Adapters | PascalCase with `Adapter` suffix | `NodeFileSystemAdapter.ts` |
| Managers | PascalCase with `Manager` suffix | `TemplateManager.ts` |
| State machines | PascalCase descriptive name | `WorkflowStateMachine.ts` |
| Schemas | Lowercase domain name with `.schema.ts` | `project.schema.ts` |
| Tests | Match subject plus `.test.ts` | `ContextCompactionService.test.ts` |
| CLI modules | Kebab-case for command files where established | `install-skills.ts` |
| Skill docs | `SKILL.md` inside skill directory | `skills/sdd-design/SKILL.md` |

### Code
| Element | Convention | Example |
|---------|------------|---------|
| Classes and types | PascalCase | `ProjectService`, `WorkflowOptions` |
| Interfaces and ports | PascalCase, usually no `I` prefix | `ProjectRepository`, `LoggerPort` |
| Functions and methods | camelCase | `generatePhaseHandoff` |
| Constants | UPPER_SNAKE_CASE or PascalCase object exports depending on local pattern | `TYPES`, `DEFAULT_LOCALE` |
| Variables | camelCase | `featureName`, `specPath` |

## Module Conventions
- Use ESM imports and include `.js` extensions for local runtime imports in TypeScript source where the existing code does.
- Prefer named exports for services, types, and utilities.
- Keep type-only imports as `import type` when importing only TypeScript types.
- Preserve dependency direction: presentation/adapters -> application -> domain, with infrastructure implementing domain ports.
- Avoid adding new global state in entrypoints; prefer DI-managed services or small local helpers for compatibility paths.

## Testing Conventions
- Unit tests live under `src/__tests__/unit/` and are grouped by area, such as `cli`, `context`, `workflow`, `skills`, `rules`, `hooks`, and `utils`.
- Add focused tests near the behavior changed; broaden coverage when touching shared workflow contracts or installer behavior.
- Use the shell-safe unit command in zsh when needed:

```bash
npx jest '--testPathPattern=__tests__.*\.test\.ts$' '--testPathIgnorePattern=integration|e2e'
```

## Generated Files and Git Hygiene
- Do not commit `dist/`, coverage output, or local installed agent artifacts.
- `.claude/`, `.agents/`, and `.codex/` generated install outputs are ignored except for files already tracked historically.
- Do not revert unrelated changes in `.spec/`, generated local agent directories, or user-modified docs while implementing a focused change.

## Build Output
- `npm run build` emits compiled JavaScript, declarations, and source maps to `dist/`.
- Package publication includes compiled runtime files and root component asset directories listed in `package.json`.
- Runtime MCP usage should work through `npx -y sdd-mcp-server@latest`, global install, or the local `mcp-server.js` development entry.

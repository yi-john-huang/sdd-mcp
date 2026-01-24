# Design: Plugin Architecture v3.0

## Architecture Overview

This design extends the existing sdd-mcp architecture with four new component managers, all following the established patterns.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Plugin Component System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ SkillManager │  │ AgentManager │  │ RulesManager │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         └─────────────────┼─────────────────┘                    │
│                           │                                      │
│                   ┌───────▼───────┐                              │
│                   │  BaseManager  │ (Abstract)                   │
│                   └───────────────┘                              │
│                                                                  │
│  ┌───────────────┐  ┌────────────┐                              │
│  │ContextManager │  │ HookLoader │                              │
│  └───────┬───────┘  └──────┬─────┘                              │
│          │                 │                                     │
│          └─────────────────┘                                     │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     DI Container (Inversify)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. BaseManager (Abstract Class) - IMPLEMENTED

Location: `src/shared/BaseManager.ts`

```typescript
abstract class BaseManager<T extends ComponentDescriptor> {
  protected readonly config: ManagerConfig;
  
  constructor(config: ManagerConfig);
  
  // Abstract method - must be implemented by subclasses
  protected abstract parseMetadata(content: string, filePath: string): T;
  
  // Common methods
  async listComponents(): Promise<T[]>;
  async getComponentContent(componentName: string): Promise<string>;
  async getComponentPath(componentName: string): Promise<string>;
  async installComponents(targetPath: string): Promise<InstallResult>;
  
  // Utility methods
  protected parseYamlFrontmatter(content: string): ComponentMetadata;
  protected getContentBody(content: string): string;
  protected copyDirectory(source: string, destination: string): Promise<void>;
}
```

### 2. RulesManager

Location: `src/rules/RulesManager.ts`

```typescript
interface RuleDescriptor extends ComponentDescriptor {
  name: string;
  description: string;
  path: string;
  priority: number;      // Execution priority (higher = first)
  alwaysActive: boolean; // Whether rule is always applied
}

class RulesManager extends BaseManager<RuleDescriptor> {
  constructor(rulesPath: string) {
    super({
      componentPath: rulesPath,
      structureType: 'file',
      fileExtension: '.md'
    });
  }
  
  protected parseMetadata(content: string, filePath: string): RuleDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    return {
      name: metadata.name || path.basename(filePath, '.md'),
      description: metadata.description || '',
      path: filePath,
      priority: Number(metadata.priority) || 0,
      alwaysActive: metadata.alwaysActive !== false
    };
  }
}
```

### 3. ContextManager

Location: `src/contexts/ContextManager.ts`

```typescript
interface ContextDescriptor extends ComponentDescriptor {
  name: string;
  description: string;
  path: string;
  mode: string;  // dev, review, planning, security-audit, research
}

class ContextManager extends BaseManager<ContextDescriptor> {
  constructor(contextsPath: string) {
    super({
      componentPath: contextsPath,
      structureType: 'file',
      fileExtension: '.md'
    });
  }
  
  protected parseMetadata(content: string, filePath: string): ContextDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    return {
      name: metadata.name || path.basename(filePath, '.md'),
      description: metadata.description || '',
      path: filePath,
      mode: metadata.mode || 'dev'
    };
  }
}
```

### 4. AgentManager

Location: `src/agents/AgentManager.ts`

```typescript
interface AgentDescriptor extends ComponentDescriptor {
  name: string;
  description: string;
  path: string;
  role: string;      // planner, architect, reviewer, implementer, etc.
  expertise: string; // Area of expertise
}

class AgentManager extends BaseManager<AgentDescriptor> {
  constructor(agentsPath: string) {
    super({
      componentPath: agentsPath,
      structureType: 'file',
      fileExtension: '.md'
    });
  }
  
  protected parseMetadata(content: string, filePath: string): AgentDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    return {
      name: metadata.name || path.basename(filePath, '.md'),
      description: metadata.description || '',
      path: filePath,
      role: metadata.role || 'assistant',
      expertise: metadata.expertise || ''
    };
  }
}
```

### 5. HookLoader

Location: `src/hooks/HookLoader.ts`

```typescript
interface HookDefinition extends ComponentDescriptor {
  name: string;
  description: string;
  path: string;
  event: string;    // pre-tool-use, post-tool-use, session-start, session-end
  priority: number;
  pattern?: string; // Optional glob pattern for conditional hooks
}

class HookLoader extends BaseManager<HookDefinition> {
  constructor(hooksPath: string) {
    super({
      componentPath: hooksPath,
      structureType: 'directory',
      mainFileName: undefined  // Will scan subdirectories
    });
  }
  
  // Override to handle nested directory structure
  async listComponents(): Promise<HookDefinition[]> {
    // Scan hooks/{event-type}/*.md structure
  }
  
  protected parseMetadata(content: string, filePath: string): HookDefinition {
    const metadata = this.parseYamlFrontmatter(content);
    const event = this.extractEventFromPath(filePath);
    return {
      name: metadata.name || path.basename(filePath, '.md'),
      description: metadata.description || '',
      path: filePath,
      event: metadata.event || event,
      priority: Number(metadata.priority) || 0,
      pattern: metadata.pattern
    };
  }
}
```

## Directory Structure

### Source Directory
```
sdd-mcp/
├── agents/                          # NEW: Agent definitions
│   ├── planner.md
│   ├── architect.md
│   ├── reviewer.md
│   ├── implementer.md
│   ├── security-auditor.md
│   └── tdd-guide.md
├── rules/                           # NEW: Rule definitions
│   ├── coding-style.md
│   ├── testing.md
│   ├── security.md
│   ├── git-workflow.md
│   ├── error-handling.md
│   └── sdd-workflow.md
├── contexts/                        # NEW: Context definitions
│   ├── dev.md
│   ├── review.md
│   ├── planning.md
│   ├── security-audit.md
│   └── research.md
├── hooks/                           # NEW: Hook definitions
│   ├── pre-tool-use/
│   ├── post-tool-use/
│   ├── session-start/
│   └── session-end/
├── skills/                          # EXISTING (enhanced)
│   ├── sdd-requirements/
│   ├── sdd-design/
│   ├── sdd-tasks/
│   ├── sdd-implement/
│   ├── sdd-steering/
│   ├── sdd-steering-custom/
│   ├── sdd-commit/
│   ├── simple-task/
│   ├── sdd-review/              # NEW
│   ├── sdd-security-check/      # NEW
│   └── sdd-test-gen/            # NEW
└── src/
    ├── shared/
    │   ├── BaseManager.ts       # IMPLEMENTED
    │   └── index.ts
    ├── agents/
    │   └── AgentManager.ts      # NEW
    ├── rules/
    │   └── RulesManager.ts      # NEW
    ├── contexts/
    │   └── ContextManager.ts    # NEW
    ├── hooks/
    │   └── HookLoader.ts        # NEW
    └── infrastructure/di/
        ├── types.ts             # UPDATE: Add new symbols
        └── container.ts         # UPDATE: Register new managers
```

### Installation Target Structure
```
.claude/
├── skills/           # From skills/
├── agents/           # From agents/
├── rules/            # From rules/
├── contexts/         # From contexts/
└── hooks/            # From hooks/
```

## Component File Format

All component files use YAML frontmatter followed by markdown content:

### Rule Example (`rules/coding-style.md`)
```markdown
---
name: coding-style
description: Enforce consistent coding style across the codebase
priority: 100
alwaysActive: true
---

# Coding Style Rules

## TypeScript Guidelines
- Use explicit types for function parameters and return values
- Prefer `const` over `let` where possible
...
```

### Agent Example (`agents/reviewer.md`)
```markdown
---
name: reviewer
description: Expert code reviewer with Linus-style feedback
role: reviewer
expertise: Code quality, best practices, performance
---

# Code Reviewer Agent

You are an expert code reviewer who provides direct, constructive feedback.

## Review Focus Areas
- Code correctness and logic errors
- Performance implications
...
```

### Context Example (`contexts/dev.md`)
```markdown
---
name: dev
description: Development mode with implementation focus
mode: dev
---

# Development Context

In development mode, focus on:
- Writing clean, maintainable code
- Following TDD practices
...
```

## DI Container Updates

### New Type Symbols (`src/infrastructure/di/types.ts`)
```typescript
export const TYPES = {
  // ... existing symbols ...
  
  // New component managers
  AgentManager: Symbol.for("AgentManager"),
  RulesManager: Symbol.for("RulesManager"),
  ContextManager: Symbol.for("ContextManager"),
  HookLoader: Symbol.for("HookLoader"),
} as const;
```

### Container Registration (`src/infrastructure/di/container.ts`)
```typescript
// Import new managers
import { AgentManager } from '../agents/AgentManager.js';
import { RulesManager } from '../rules/RulesManager.js';
import { ContextManager } from '../contexts/ContextManager.js';
import { HookLoader } from '../hooks/HookLoader.js';

// Register new managers (with path configuration)
container.bind<AgentManager>(TYPES.AgentManager)
  .toDynamicValue(() => new AgentManager(getAgentsPath()));
container.bind<RulesManager>(TYPES.RulesManager)
  .toDynamicValue(() => new RulesManager(getRulesPath()));
container.bind<ContextManager>(TYPES.ContextManager)
  .toDynamicValue(() => new ContextManager(getContextsPath()));
container.bind<HookLoader>(TYPES.HookLoader)
  .toDynamicValue(() => new HookLoader(getHooksPath()));
```

## CLI Updates

### Unified Install Command (`src/cli/install.ts`)

```typescript
class UnifiedInstallCLI {
  private skillManager: SkillManager;
  private agentManager: AgentManager;
  private rulesManager: RulesManager;
  private contextManager: ContextManager;
  private hookLoader: HookLoader;
  
  async runUnified(options: CLIOptions): Promise<void> {
    const baseTarget = options.targetPath || '.claude';
    
    if (options.installSkills) {
      await this.skillManager.installComponents(`${baseTarget}/skills`);
    }
    if (options.installAgents) {
      await this.agentManager.installComponents(`${baseTarget}/agents`);
    }
    if (options.installRules) {
      await this.rulesManager.installComponents(`${baseTarget}/rules`);
    }
    if (options.installContexts) {
      await this.contextManager.installComponents(`${baseTarget}/contexts`);
    }
    if (options.installHooks) {
      await this.hookLoader.installComponents(`${baseTarget}/hooks`);
    }
  }
}
```

## Testing Strategy

Each manager will have corresponding unit tests following the existing SkillManager.test.ts pattern:

```typescript
// src/__tests__/unit/rules/RulesManager.test.ts
describe('RulesManager', () => {
  describe('listComponents', () => {
    it('should return list of available rules');
    it('should return empty array when rules directory is empty');
    it('should parse YAML frontmatter correctly');
  });
  
  describe('installComponents', () => {
    it('should copy all rules to target directory');
    it('should track failed installations');
  });
});
```

## Migration Path

1. Existing skills continue to work unchanged
2. New components are additive - no breaking changes
3. Users opt-in by running `npx sdd-mcp-server install`
4. Each component type can be installed independently

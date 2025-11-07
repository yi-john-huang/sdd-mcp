# MCP SDD Server Architecture

**Version**: 1.6.2  
**Last Updated**: 2025-11-05  
**Status**: Production

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Layered Architecture](#layered-architecture)
4. [Module Loading System](#module-loading-system)
5. [MCP Protocol Integration](#mcp-protocol-integration)
6. [Workflow Engine](#workflow-engine)
7. [Requirements Clarification System](#requirements-clarification-system)
8. [Plugin System](#plugin-system)
9. [Data Flow](#data-flow)
10. [Security Architecture](#security-architecture)
11. [Deployment Models](#deployment-models)

---

## Overview

The MCP SDD Server is a **Model Context Protocol (MCP)** server that implements **Spec-Driven Development (SDD)** workflows for AI-agent CLIs and IDEs. It provides a structured approach to software development through:

- **Automated Requirements Clarification**: Analyzes project descriptions and interactively gathers missing information
- **Steering Document Generation**: Creates context-rich documentation from codebase analysis
- **Workflow State Management**: Guides teams through Requirements → Design → Tasks → Implementation phases
- **Cross-Context Compatibility**: Unified module loading supporting npx, npm, node, and Docker execution

### Key Design Principles

- **Domain-Driven Design (DDD)**: Clear separation between domain logic, application services, and infrastructure
- **SOLID Principles**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **Dependency Injection**: Inversify container for loose coupling and testability
- **Test-Driven Development (TDD)**: 100% test coverage for critical paths
- **Security by Design**: OWASP Top 10 aligned, input sanitization, least privilege

---

## System Architecture

```mermaid
graph TB
    subgraph "AI Clients"
        A1[Claude Code]
        A2[Cursor IDE]
        A3[Other MCP Clients]
    end

    subgraph "MCP Server - Entry Points"
        B1[mcp-server.js<br/>Legacy Entry]
        B2[dist/index.js<br/>TypeScript Entry]
    end

    subgraph "Module Loader v1.6.2"
        ML[moduleLoader.ts<br/>Unified Loader]
        ML1[Path 1: ./utils/*.js<br/>npm start, node dist/]
        ML2[Path 2: ../utils/*.js<br/>npm run dev]
        ML3[Path 3: ./*.js<br/>npx context]
        ML4[Path 4: ../*.js<br/>Alternative npx]
    end

    subgraph "Core Modules"
        C1[documentGenerator<br/>Codebase Analysis]
        C2[specGenerator<br/>Spec Documents]
    end

    subgraph "MCP Infrastructure"
        D1[MCPServer<br/>Protocol Handler]
        D2[ToolRegistry<br/>Tool Management]
        D3[SessionManager<br/>State Management]
    end

    subgraph "Application Layer"
        E1[WorkflowEngine<br/>Phase Management]
        E2[RequirementsClarification<br/>Interactive Q&A]
        E3[SteeringDocuments<br/>Context Generation]
    end

    subgraph "Domain Layer"
        F1[ProjectContext<br/>Business Logic]
        F2[WorkflowStateMachine<br/>FSM]
        F3[QualityGate<br/>Validation]
    end

    subgraph "Infrastructure"
        G1[FileSystemPort<br/>I/O Abstraction]
        G2[LoggerPort<br/>Logging]
        G3[PluginManager<br/>Extensibility]
    end

    A1 & A2 & A3 --> B1 & B2
    B2 --> ML
    ML --> ML1 & ML2 & ML3 & ML4
    ML1 & ML2 & ML3 & ML4 --> C1 & C2
    B1 & B2 --> D1
    D1 --> D2 & D3
    D2 --> E1 & E2 & E3
    E1 & E2 & E3 --> F1 & F2 & F3
    F1 & F2 & F3 --> G1 & G2 & G3
```

---

## Layered Architecture

The system follows a **4-layer hexagonal architecture** pattern:

```mermaid
graph LR
    subgraph "Presentation Layer"
        P1[MCP Tools API]
        P2[CLI Interface]
    end

    subgraph "Application Layer"
        A1[Services]
        A2[Use Cases]
        A3[DTOs]
    end

    subgraph "Domain Layer"
        D1[Entities]
        D2[Value Objects]
        D3[Domain Services]
        D4[Business Rules]
    end

    subgraph "Infrastructure Layer"
        I1[File System]
        I2[Database]
        I3[External APIs]
        I4[Logging]
    end

    P1 & P2 --> A1 & A2
    A1 & A2 --> D1 & D2 & D3 & D4
    A1 & A2 --> I1 & I2 & I3 & I4
    D3 --> I1

    style D1 fill:#e1f5fe
    style D2 fill:#e1f5fe
    style D3 fill:#e1f5fe
    style D4 fill:#e1f5fe
```

### Layer Responsibilities

#### 1. Presentation Layer (`/src/infrastructure/mcp`, `/src/adapters`)
- **MCP Protocol Handling**: Translates MCP requests to application commands
- **Tool Registration**: Exposes SDD tools (sdd-init, sdd-steering, etc.)
- **Session Management**: Maintains client connection state
- **Error Formatting**: Converts internal errors to MCP error responses

#### 2. Application Layer (`/src/application/services`)
- **Orchestration**: Coordinates domain services and infrastructure
- **Use Case Implementation**: Implements business workflows
- **Data Transformation**: Converts between DTOs and domain objects
- **Transaction Management**: Ensures consistency across operations

Key Services:
- `RequirementsClarificationService`: Orchestrates the 5 specialized services
- `WorkflowEngineService`: Manages SDD phase transitions
- `SteeringDocumentService`: Generates steering documents
- `ProjectInitializationService`: Initializes new SDD projects

#### 3. Domain Layer (`/src/domain`)
- **Business Logic**: Core business rules and validation
- **Domain Models**: Entities, value objects, aggregates
- **Domain Services**: Business operations that don't belong to entities
- **Workflow State Machine**: Finite state machine for SDD phases

Domain Components:
- `ProjectContext`: Root aggregate for project state
- `WorkflowStateMachine`: FSM (requirements → design → tasks → implementation)
- `QualityGate`: Validation rules for phase transitions

#### 4. Infrastructure Layer (`/src/infrastructure`)
- **Ports & Adapters**: Implements domain interfaces
- **External Services**: File I/O, logging, databases
- **Framework Integration**: MCP SDK, Inversify DI container
- **Plugin System**: Dynamic tool and steering document loading

---

## Module Loading System

**Introduced in v1.6.2** to fix cross-context module loading issues.

### Problem Statement

Prior to v1.6.2, hardcoded import paths in `src/index.ts` failed when run via npx:

```typescript
// ❌ OLD: Breaks in npx context
const { analyzeProject } = await import("./utils/documentGenerator.js");
```

**Root Cause**: Different execution contexts have different working directories:
- `npm start`: CWD = `/dist/`
- `npm run dev`: CWD = `/dist/tools/`
- `node dist/index.js`: CWD = `/dist/`
- `npx sdd-mcp-server`: CWD = `/node_modules/.bin/`

### Solution Architecture

```mermaid
graph TD
    A[Handler Function Needs Module] --> B[loadDocumentGenerator OR loadSpecGenerator]
    
    B --> C{Try Path 1<br/>./utils/*.js}
    C -->|Success| Z[Return Module]
    C -->|Fail| D{Try Path 2<br/>../utils/*.js}
    
    D -->|Success| Z
    D -->|Fail| E{Try Path 3<br/>./*.js}
    
    E -->|Success| Z
    E -->|Fail| F{Try Path 4<br/>../*.js}
    
    F -->|Success| Z
    F -->|Fail| G[Throw Error<br/>with all attempted paths]
    
    Z --> H[Log Success Path<br/>console.error SDD-DEBUG]
    
    style Z fill:#c8e6c9
    style G fill:#ffcdd2
    style H fill:#fff9c4
```

### Implementation Details

**File**: `src/utils/moduleLoader.ts`

```typescript
export async function loadDocumentGenerator(): Promise<DocumentGeneratorModule> {
  const paths = [
    './utils/documentGenerator.js',    // Priority 1: npm start, node dist/index.js
    '../utils/documentGenerator.js',   // Priority 2: npm run dev (CWD=dist/tools/)
    './documentGenerator.js',          // Priority 3: npx (CWD=node_modules/.bin/)
    '../documentGenerator.js'          // Priority 4: Alternative npx context
  ];

  const errors: string[] = [];

  for (const path of paths) {
    try {
      const module = await import(path);
      console.error(`[SDD-DEBUG] ✅ Loaded documentGenerator from: ${path}`);
      return module as DocumentGeneratorModule;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${errorMessage}`);
    }
  }

  throw new Error(
    `Failed to load documentGenerator. Attempted paths:\n${errors.map(e => `  - ${e}`).join('\n')}`
  );
}
```

**Key Features**:
- ✅ **Sequential Fallback**: Tries 4 paths in priority order
- ✅ **Comprehensive Error Messages**: Lists all attempted paths on failure
- ✅ **Debug Logging**: Logs successful path with `console.error` for troubleshooting
- ✅ **Type Safety**: Strong TypeScript interfaces for loaded modules
- ✅ **Zero Dependencies**: Pure ES module imports, no external libraries

### Integration Points

Updated 4 handler functions in `src/index.ts`:

1. **handleSteeringSimplified** (line ~436): Uses `loadDocumentGenerator()`
2. **handleRequirementsSimplified** (line ~1189): Uses `loadSpecGenerator()`
3. **handleDesignSimplified** (line ~1350): Uses `loadSpecGenerator()`
4. **handleTasksSimplified** (line ~1476): Uses `loadSpecGenerator()`

---

## MCP Protocol Integration

```mermaid
sequenceDiagram
    participant AI as AI Client<br/>(Claude Code)
    participant MCP as MCPServer
    participant TR as ToolRegistry
    participant AS as Application Service
    participant DL as Domain Layer
    participant FS as FileSystem Port

    AI->>MCP: MCP Request<br/>tool: sdd-init
    MCP->>TR: lookupTool("sdd-init")
    TR->>MCP: ToolDefinition
    MCP->>AS: ProjectInitializationService.init()
    
    AS->>DL: Validate project description
    DL->>AS: QualityScore: 45%
    
    alt Score < 70%
        AS->>AI: Interactive Clarification Questions
        AI->>AS: User Answers
        AS->>DL: Enrich Description with 5W1H
    end
    
    AS->>FS: Create .kiro/specs/{feature}/
    AS->>FS: Write spec.json
    FS->>AS: Success
    
    AS->>MCP: ToolResult (success)
    MCP->>AI: MCP Response<br/>with spec details
```

### MCP Server Components

#### MCPServer (`/src/infrastructure/mcp/MCPServer.ts`)
- **Responsibilities**: Protocol translation, error handling, capability negotiation
- **Dependencies**: ToolRegistry, SessionManager, LoggerPort
- **Lifecycle**: Singleton, initialized via DI container

#### ToolRegistry (`/src/infrastructure/mcp/ToolRegistry.ts`)
- **Responsibilities**: Tool registration, lookup, parameter validation
- **Tool Definition**: JSON Schema validation for tool parameters
- **Extensibility**: Supports plugin-provided tools

#### SessionManager (`/src/infrastructure/mcp/SessionManager.ts`)
- **Responsibilities**: Client session tracking, state persistence
- **State Storage**: In-memory with optional Redis backend
- **Session Lifecycle**: Create → Active → Closed

---

## Workflow Engine

The SDD workflow follows a finite state machine with 5 phases:

```mermaid
stateDiagram-v2
    [*] --> Init: sdd-init
    
    Init --> Requirements: Auto-generate requirements.md
    Requirements --> RequirementsApproval: User reviews
    
    RequirementsApproval --> Design: sdd-design<br/>(if approved)
    RequirementsApproval --> Requirements: Reject (revise)
    
    Design --> DesignApproval: User reviews
    DesignApproval --> Tasks: sdd-tasks<br/>(if approved)
    DesignApproval --> Design: Reject (revise)
    
    Tasks --> TasksApproval: User reviews
    TasksApproval --> Implementation: sdd-implement<br/>(if approved)
    TasksApproval --> Tasks: Reject (revise)
    
    Implementation --> Testing: Run tests
    Testing --> Done: All tests pass
    Testing --> Implementation: Failures (fix)
    
    Done --> [*]
    
    note right of Requirements
        requirements.md
        - User stories
        - Acceptance criteria
        - Non-functional requirements
    end note
    
    note right of Design
        design.md
        - Architecture
        - Component design
        - Data models
    end note
    
    note right of Tasks
        tasks.md
        - Task breakdown
        - Dependencies
        - Estimates
    end note
```

### Workflow State Persistence

**File**: `.kiro/specs/{feature-name}/spec.json`

```json
{
  "feature_name": "user-authentication",
  "phase": "design-approved",
  "approvals": {
    "requirements": {
      "generated": true,
      "approved": true,
      "approved_at": "2025-11-05T10:30:00Z"
    },
    "design": {
      "generated": true,
      "approved": true,
      "approved_at": "2025-11-05T14:20:00Z"
    },
    "tasks": {
      "generated": false,
      "approved": false
    }
  },
  "metadata": {
    "created_at": "2025-11-05T09:00:00Z",
    "updated_at": "2025-11-05T14:20:00Z",
    "project_path": "/path/to/project"
  }
}
```

---

## Requirements Clarification System

**Introduced in v1.5.0, refactored in v1.6.0** following Single Responsibility Principle.

### Architecture (v1.6.0+)

```mermaid
graph TD
    A[User provides project description] --> B[SteeringContextLoader]
    B --> C[Load existing steering docs]
    C --> D[DescriptionAnalyzer]
    
    D --> E[Semantic Analysis:<br/>WHY WHO WHAT SUCCESS]
    E --> F{Quality Score<br/>>= 70%?}
    
    F -->|Yes| G[Generate requirements.md]
    F -->|No| H[QuestionGenerator]
    
    H --> I[Generate targeted questions]
    I --> J[Present questions to user]
    J --> K[User provides answers]
    K --> L[AnswerValidator]
    
    L --> M{Valid<br/>answers?}
    M -->|No| N[Request clarification]
    N --> K
    M -->|Yes| O[DescriptionEnricher]
    
    O --> P[Synthesize 5W1H enriched description]
    P --> G
    
    style F fill:#fff9c4
    style M fill:#fff9c4
    style G fill:#c8e6c9
```

### 5 Specialized Services

#### 1. SteeringContextLoader
- **Purpose**: Load existing steering documents (product.md, tech.md)
- **Input**: Project path
- **Output**: SteeringContext (flags for existing docs)
- **Location**: `src/application/services/SteeringContextLoader.ts`

#### 2. DescriptionAnalyzer
- **Purpose**: Analyze project description quality (0-100 score)
- **Scoring Factors**:
  - WHY present (+30 points): Business justification
  - WHO present (+20 points): Target users
  - WHAT present (+20 points): Core features
  - SUCCESS present (+15 points): Metrics
  - Ambiguity penalty (-5 per term, max -15)
  - Length bonus (+5 per threshold: 100, 300, 500 chars)
- **Location**: `src/application/services/DescriptionAnalyzer.ts`

#### 3. QuestionGenerator
- **Purpose**: Generate targeted clarification questions
- **Question Selection**: Based on analysis gaps and steering context
- **Configuration**: Externalized to `clarification-questions.ts`
- **Location**: `src/application/services/QuestionGenerator.ts`

#### 4. AnswerValidator
- **Purpose**: Validate and sanitize user answers
- **Validations**:
  - Required fields present
  - Minimum length (10 chars)
  - XSS/injection detection
  - Path traversal prevention
- **Location**: `src/application/services/AnswerValidator.ts`

#### 5. DescriptionEnricher
- **Purpose**: Synthesize enriched description with 5W1H structure
- **Output Format**:
  ```
  WHY: {business justification}
  WHO: {target users}
  WHAT: {core features}
  HOW: {technical approach}
  SUCCESS: {metrics and KPIs}
  ```
- **Location**: `src/application/services/DescriptionEnricher.ts`

---

## Plugin System

```mermaid
graph LR
    subgraph "Core System"
        A[PluginManager]
        B[HookSystem]
        C[PluginToolRegistry]
        D[PluginSteeringRegistry]
    end

    subgraph "Plugin Types"
        E[Tool Plugins]
        F[Steering Plugins]
        G[Hook Plugins]
    end

    subgraph "Hooks"
        H[pre-init]
        I[post-requirements]
        J[pre-design]
        K[post-tasks]
    end

    A --> E & F & G
    B --> H & I & J & K
    E --> C
    F --> D
    G --> B
```

### Plugin Development

**Location**: `.kiro/plugins/`

**Example Tool Plugin**:
```typescript
// .kiro/plugins/custom-validator/index.ts
export default {
  name: 'custom-validator',
  type: 'tool',
  version: '1.0.0',
  
  tool: {
    name: 'validate-requirements',
    description: 'Custom requirements validator',
    inputSchema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' }
      },
      required: ['featureName']
    },
    
    async execute(args: any) {
      // Custom validation logic
      return { valid: true, issues: [] };
    }
  }
};
```

---

## Data Flow

### Document Generation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant AI as AI Agent
    participant Tool as sdd-steering
    participant ML as ModuleLoader
    participant DG as DocumentGenerator
    participant FS as FileSystem
    participant CB as Codebase

    U->>AI: "Generate steering docs"
    AI->>Tool: tool: sdd-steering<br/>args: {projectPath}
    Tool->>ML: loadDocumentGenerator()
    
    ML->>ML: Try ./utils/documentGenerator.js
    alt Path 1 Success
        ML->>Tool: Module loaded
    else Path 1 Fail
        ML->>ML: Try ../utils/documentGenerator.js
        ML->>Tool: Module loaded (or try next path)
    end
    
    Tool->>DG: analyzeProject(projectPath)
    DG->>CB: Read package.json
    DG->>CB: Detect languages
    DG->>CB: Find frameworks
    DG->>CB: Analyze structure
    CB->>DG: Project metadata
    
    DG->>Tool: ProjectAnalysis
    Tool->>DG: generateProductDocument(analysis)
    Tool->>DG: generateTechDocument(analysis)
    Tool->>DG: generateStructureDocument(analysis)
    
    Tool->>FS: Write .kiro/steering/product.md
    Tool->>FS: Write .kiro/steering/tech.md
    Tool->>FS: Write .kiro/steering/structure.md
    
    FS->>Tool: Success
    Tool->>AI: Documents generated
    AI->>U: "Steering docs created successfully"
```

---

## Security Architecture

### Defense in Depth Layers

```mermaid
graph TB
    subgraph "Layer 1: Input Validation"
        A1[JSON Schema Validation]
        A2[Type Safety TypeScript]
        A3[Parameter Sanitization]
    end

    subgraph "Layer 2: Application Security"
        B1[Path Traversal Prevention]
        B2[XSS/Injection Detection]
        B3[Rate Limiting]
        B4[Input Length Limits]
    end

    subgraph "Layer 3: Runtime Security"
        C1[Least Privilege Principle]
        C2[File Permission Checks]
        C3[Error Message Sanitization]
        C4[Logging without Secrets]
    end

    subgraph "Layer 4: Container Security"
        D1[Distroless Base Image]
        D2[Non-root User UID 1001]
        D3[Read-only Filesystem]
        D4[Dropped Capabilities]
    end

    A1 & A2 & A3 --> B1 & B2 & B3 & B4
    B1 & B2 & B3 & B4 --> C1 & C2 & C3 & C4
    C1 & C2 & C3 & C4 --> D1 & D2 & D3 & D4
```

### OWASP Top 10 Alignment

| OWASP Risk | Mitigation | Implementation |
|------------|-----------|----------------|
| A01: Broken Access Control | Path traversal prevention | `src/application/services/AnswerValidator.ts` |
| A02: Cryptographic Failures | No sensitive data storage | Stateless design, no credentials |
| A03: Injection | Input sanitization | Regex-based XSS/SQL detection |
| A04: Insecure Design | Security by design | `.kiro/steering/security-check.md` |
| A05: Security Misconfiguration | Secure defaults | Docker distroless, non-root user |
| A06: Vulnerable Components | Dependency scanning | `npm audit` in CI/CD |
| A07: Authentication Failures | N/A | No authentication (local tool) |
| A08: Software & Data Integrity | Immutable builds | Distroless read-only filesystem |
| A09: Logging Failures | Structured logging | LoggerPort with correlation IDs |
| A10: SSRF | No external requests | Offline-first design |

---

## Deployment Models

### 1. NPX (Recommended)

```bash
npx -y sdd-mcp-server@latest
```

**Advantages**:
- ✅ No installation required
- ✅ Always uses latest version
- ✅ No version conflicts
- ✅ Secure: npm registry verification

**Module Loading**: Path 3 (`./documentGenerator.js`) or Path 4 (`../documentGenerator.js`)

### 2. Global Installation

```bash
npm install -g sdd-mcp-server@latest
sdd-mcp-server
```

**Advantages**:
- ✅ Persistent installation
- ✅ Faster startup (no download)
- ✅ Offline usage after install

**Module Loading**: Path 1 (`./utils/documentGenerator.js`)

### 3. Docker

```bash
docker run -p 3000:3000 ghcr.io/yi-john-huang/sdd-mcp:latest
```

**Advantages**:
- ✅ Isolated environment
- ✅ Reproducible builds
- ✅ Security hardened (distroless)

**Module Loading**: Path 1 (`./utils/documentGenerator.js`)

### 4. Local Development

```bash
git clone https://github.com/yi-john-huang/sdd-mcp.git
npm run dev
```

**Advantages**:
- ✅ Fastest development cycle
- ✅ Hot reload with tsx
- ✅ Full debugging support

**Module Loading**: Path 2 (`../utils/documentGenerator.js`)

---

## Performance Characteristics

### Module Loading Performance

| Execution Context | First Import (ms) | Cached Import (ms) | Fallback Attempts |
|------------------|-------------------|--------------------|--------------------|
| npm start | 10-20 | <5 | 1 (Path 1) |
| npm run dev | 15-25 | <5 | 2 (Path 2) |
| node dist/index.js | 10-20 | <5 | 1 (Path 1) |
| npx | 50-100* | <5 | 3-4 (Path 3-4) |

*Includes npm package download on first run

### Document Generation Performance

| Operation | Time (ms) | Notes |
|-----------|-----------|-------|
| Analyze project | 200-500 | Depends on project size |
| Generate product.md | 50-100 | Template rendering |
| Generate tech.md | 100-200 | Framework detection |
| Generate structure.md | 150-300 | Directory traversal |
| **Total** | **500-1100** | ~1 second end-to-end |

### Memory Usage

| Component | Heap (MB) | Notes |
|-----------|-----------|-------|
| Base server | 20-30 | MCP SDK + Inversify |
| Document generation | +10-20 | File I/O buffers |
| Requirements clarification | +5-10 | Analysis state |
| **Peak** | **40-60** | Typical usage |

---

## Testing Strategy

```mermaid
graph TD
    subgraph "Test Pyramid"
        A[Unit Tests<br/>71 tests<br/>100% coverage]
        B[Integration Tests<br/>Manual validation]
        C[E2E Tests<br/>Cross-context validation]
    end

    subgraph "Test Frameworks"
        D[Jest<br/>Unit + Integration]
        E[TypeScript<br/>Type checking]
        F[ESLint<br/>Code quality]
    end

    A --> D
    B --> D
    C --> D
    D --> E --> F
```

### Test Coverage (v1.6.2)

- **Unit Tests**: 71 tests passing
  - moduleLoader: 6 tests (100% coverage)
  - RequirementsClarification: 62 tests (95% coverage)
  - Existing: 3 tests
- **Integration Tests**: Manual cross-context validation
  - npm start ✅
  - npm run dev ✅
  - node dist/index.js ✅
  - npx ✅
- **E2E Tests**: Production npx validation ✅

---

## Future Architecture Considerations

### Planned Improvements (v1.7.0+)

1. **Distributed Workflow State**
   - Redis backend for SessionManager
   - Multi-instance coordination
   - Shared workflow state

2. **Enhanced Plugin System**
   - TypeScript plugin development
   - Plugin dependency resolution
   - Sandboxed plugin execution

3. **GraphQL API**
   - Alternative to MCP for web clients
   - Real-time subscriptions
   - Schema introspection

4. **AI Model Integration**
   - Local LLM support (Ollama, LM Studio)
   - Semantic analysis improvements
   - Automated code review

5. **Telemetry & Observability**
   - OpenTelemetry integration
   - Distributed tracing
   - Performance metrics

---

## References

- **MCP Specification**: https://modelcontextprotocol.io
- **Source Code**: https://github.com/yi-john-huang/sdd-mcp
- **npm Package**: https://www.npmjs.com/package/sdd-mcp-server
- **Issue Tracker**: https://github.com/yi-john-huang/sdd-mcp/issues

---

**Maintained by**: SDD MCP Server Team  
**License**: MIT  
**Last Review**: 2025-11-05

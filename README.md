# MCP SDD Server

[![npm version](https://badge.fury.io/js/sdd-mcp-server.svg)](https://badge.fury.io/js/sdd-mcp-server)
[![GitHub release](https://img.shields.io/github/release/yi-john-huang/sdd-mcp.svg)](https://github.com/yi-john-huang/sdd-mcp/releases/latest)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

A Model Context Protocol (MCP) server implementing Spec-Driven Development (SDD) workflows for AI-agent CLIs and IDEs like Claude Code, Cursor, and others.

> **v3.4.0** - Automatic compact context handoffs, lean install defaults, and optional TDD test-case review checkpoints. See [CHANGELOG.md](CHANGELOG.md) for full version history.

## 🚀 Quick Start

### Option 1: Direct NPX Usage (Recommended)
```bash
# No installation required - use directly with npx
npx -y sdd-mcp-server@latest

# Pin exact version (optional)
npx -y sdd-mcp-server@3.4.0

# For Claude Code MCP integration, add to your configuration:
# "sdd-mcp-server": {
#   "command": "npx",
#   "args": ["-y", "sdd-mcp-server@latest"]
# }
```

### Option 2: Install Globally
```bash
# Install globally for persistent usage
npm install -g sdd-mcp-server@latest

# Pin exact version (optional)
npm install -g sdd-mcp-server@3.4.0

# Start the server
sdd-mcp-server
```

### Option 3: Clone and Run
```bash
# Clone the repository
git clone https://github.com/yi-john-huang/sdd-mcp.git
cd sdd-mcp

# Install and start
npm install
npm run build
npm start
```

### Option 4: Docker (Secure Distroless Image)
```bash
# Build distroless image locally
docker build --target production -t sdd-mcp-server .

# Run with Docker (secure distroless image)
docker run -p 3000:3000 sdd-mcp-server

# Or with Docker Compose (includes security hardening)
curl -O https://raw.githubusercontent.com/yi-john-huang/sdd-mcp/develop/docker-compose.yml
docker-compose up -d
```

#### 🔒 Security Features
- **Distroless base image**: Uses `gcr.io/distroless/nodejs18-debian11` for minimal attack surface
- **No shell access**: Container contains only Node.js runtime and application code
- **Non-root user**: Runs as user ID 1001 (no privilege escalation)
- **Read-only filesystem**: Container filesystem is immutable at runtime
- **Dropped capabilities**: All Linux capabilities dropped except minimal required ones
- **Security options**: `no-new-privileges` prevents privilege escalation

## 🔧 Configuration for AI Clients

### Claude Code
Add to your MCP settings using the command line:
```bash
# Option 1: Use npx (no installation required)
claude mcp add sdd -s local -- npx -y sdd-mcp-server@latest

# Option 2: Install globally first
npm install -g sdd-mcp-server@latest
claude mcp add sdd "sdd-mcp-server" -s local

# Verify connection
claude mcp list
# Should show: sdd: ✓ Connected

# For development (local repo):
git clone https://github.com/yi-john-huang/sdd-mcp.git
cd sdd-mcp
# Use the dedicated MCP entry
claude mcp add sdd "$(pwd)/mcp-server.js" -s local
```

Manual configuration in `~/.claude.json`:
```json
{
  "mcpServers": {
    "sdd": {
      "command": "sdd-mcp-server",
      "args": [],
      "env": {}
    }
  }
}
```

### Cursor IDE
Add to your MCP configuration:
```json
{
  "sdd-server": {
    "command": "npx",
    "args": ["-y", "sdd-mcp-server@latest"],
    "env": {}
  }
}
```

Or with global installation:
```json
{
  "sdd-server": {
    "command": "sdd-mcp-server",
    "args": [],
    "env": {}
  }
}
```

### Other MCP Clients
Any MCP-compatible client can connect using stdio transport:
```bash
# Use npx (no installation required)
npx -y sdd-mcp-server@latest

# Or install globally first
npm install -g sdd-mcp-server@latest
sdd-mcp-server
```

## 🎯 Agent Skills & Components (v3.4.0)

SDD now uses a **hybrid architecture** for better token efficiency:

- **MCP Tools**: Action-oriented operations (init, status, approve, quality-check, validate, spec-impl)
- **Agent Skills**: Template/guidance-heavy operations (requirements, design, tasks, steering, implement, commit)

### Installing Components (v3.4.0)

```bash
# Recommended: lean install for lower token usage (skills, steering, hooks)
npx sdd-mcp-server install

# Full install when you explicitly want all always-on guidance components
npx sdd-mcp-server install --profile full

# Install specific component types
npx sdd-mcp-server install --skills      # Skills to .claude/skills/
npx sdd-mcp-server install --steering    # Steering to .spec/steering/
npx sdd-mcp-server install --rules       # Rules to .claude/rules/
npx sdd-mcp-server install --contexts    # Contexts to .claude/contexts/
npx sdd-mcp-server install --agents      # Agents to .claude/agents/
npx sdd-mcp-server install --hooks       # Hooks to .claude/hooks/

# Install multiple component types
npx sdd-mcp-server install --skills --rules --agents

# List all available components
npx sdd-mcp-server install --list

# Legacy: Install skills only
npx sdd-mcp-server install-skills
```

**Component Types (v3.4.0):**
| Component | Install Path | Purpose |
|-----------|--------------|---------|
| **Skills** | `.claude/skills/` | Workflow guidance (requirements, design, tasks, implement, etc.) |
| **Steering** | `.spec/steering/` | Project-specific templates (product, tech, structure) |
| **Rules** | `.claude/rules/` | Optional always-active guidelines (coding-style, testing, security, git-workflow) |
| **Contexts** | `.claude/contexts/` | Mode-specific prompts (dev, review, planning, security-audit, research) |
| **Agents** | `.claude/agents/` | Specialized AI personas (planner, architect, reviewer, implementer) |
| **Hooks** | `.claude/hooks/` | Event-driven automation (pre-tool-use, post-tool-use, session events) |

### Component Architecture & Relationships

The 6 component types work together in a **layered guidance model**:

```
┌──────────────────────────────────────────────────────────────┐
│                     User Request                             │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  HOOKS (pre-tool-use)                                        │
│  • Validate workflow order (e.g., requirements before design)│
│  • Check test coverage before implementation                 │
│  • Triggered automatically on events                         │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  RULES (optional always-active profile)                      │
│  • coding-style.md → TypeScript/JS conventions               │
│  • testing.md → TDD requirements                             │
│  • security.md → OWASP guidelines                            │
│  • Install only when your client benefits from always-on     │
│    rule files                                                │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  CONTEXTS (mode-specific)                                    │
│  • dev.md → Implementation focus                             │
│  • review.md → Quality focus                                 │
│  • planning.md → Architecture focus                          │
│  • Activated based on current task type                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  AGENTS (specialized personas)                               │
│  • reviewer.md → Linus-style code review                     │
│  • architect.md → System design expertise                    │
│  • implementer.md → TDD implementation                       │
│  • Invoked for specific expertise needs                      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  SKILLS (on-demand workflows)                                │
│  • /sdd-requirements → EARS requirements template            │
│  • /sdd-design → Architecture design template                │
│  • /sdd-implement → Implementation checklist                 │
│  • User-invoked via slash commands                           │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  STEERING (project-specific templates - v3.4.0)              │
│  • product.md → Product description                          │
│  • tech.md → Technology stack                                │
│  • structure.md → Project structure                          │
│  • (Static guidance now in agents/rules/skills)              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  MCP TOOLS (actions)                                         │
│  • sdd-init, sdd-approve, sdd-status, sdd-spec-impl          │
│  • Execute actual operations                                 │
└──────────────────────────────────────────────────────────────┘
```

**When Each Component Activates:**
| Component | Activation | Example |
|-----------|------------|---------|
| **Rules** | Full profile/session start | `coding-style.md` enforces conventions when rules are installed |
| **Contexts** | Task type detection | `review.md` activates when reviewing code |
| **Agents** | Explicit invocation | `reviewer.md` invoked by `/sdd-review` skill |
| **Skills** | User command (`/skill-name`) | `/sdd-requirements` loads requirements template |
| **Steering** | Project customization | `/sdd-steering` generates `product.md`, `tech.md` |
| **Hooks** | Events (pre/post tool, session) | `validate-sdd-workflow` runs before `sdd-design` |

### Migrating from .kiro to .spec (v2.1.0+)

If you have existing projects using the legacy `.kiro` directory, migrate to the new `.spec` standard:

```bash
# Preview migration (dry run)
npx sdd-mcp-server migrate-kiro --dry-run

# Perform migration
npx sdd-mcp-server migrate-kiro

# Migrate a specific project
npx sdd-mcp-server migrate-kiro --path ./my-project
```

**Note**: Legacy `.kiro` directories are still supported for backwards compatibility, but new projects will use `.spec`.

### Migrating Steering Documents (v3.1.0+)

If you have existing projects with static steering documents, migrate to the new consolidated architecture:

```bash
# Preview migration (dry run)
npx sdd-mcp-server migrate-steering --dry-run

# Perform migration (backs up existing steering first)
npx sdd-mcp-server migrate-steering

# Migrate a specific project
npx sdd-mcp-server migrate-steering --path ./my-project
```

**What this does:**
- Backs up existing `.spec/steering/` to `.spec/steering.backup/`
- Removes static steering docs (principles.md, tdd-guideline.md, linus-review.md, etc.)
- Preserves project-specific templates (product.md, tech.md, structure.md)
- The static content now lives in enhanced `.claude/` components

### Available Skills

After installation, use these skills in Claude Code:

| Skill | Description |
|-------|-------------|
| `/simple-task <description>` | Quick implementation for small features, bug fixes, enhancements |
| `/sdd-requirements <feature>` | Generate EARS-formatted requirements with embedded quality checklist |
| `/sdd-design <feature>` | Create architecture design with Linus-style principles |
| `/sdd-tasks <feature>` | Generate TDD task breakdown with test pyramid guidance |
| `/sdd-implement <feature>` | Implementation guidelines with SOLID, security, TDD |
| `/sdd-steering` | Create/update project-specific steering documents |
| `/sdd-steering-custom` | Create custom steering with inclusion modes |
| `/sdd-commit` | Commit/PR guidelines with conventional commits |
| `/sdd-review` | **NEW in v3.0** - Linus-style direct code review with severity levels |
| `/sdd-security-check` | **NEW in v3.0** - OWASP Top 10 security audit checklist |
| `/sdd-test-gen` | **NEW in v3.0** - TDD test generation with Red-Green-Refactor workflow |

### Token Efficiency

**Old Design** (static steering): ~3,800 tokens loaded for every operation
**New Design** (skills): ~1,700 tokens loaded only when skill invoked
**Lean Install** (default): avoids installing rules, contexts, and agents unless requested
**Automatic Handoffs**: phase approvals write compact `.spec/specs/{feature}/context/handoff.md` summaries and `sdd-context-load` uses them by default

**Savings**: ~55% fewer tokens in typical operations, with further savings from lean install and compact handoffs. On typical specs, compact handoff loading targets a 60-85% reduction versus loading full `requirements.md`, `design.md`, and `tasks.md`.

### Automatic Context Handoffs

To reduce context growth during long SDD workflows, approval tools automatically compact phase context:

```text
sdd-approve requirements  -> .spec/specs/{feature}/context/requirements-handoff.md
sdd-approve design        -> .spec/specs/{feature}/context/design-handoff.md
sdd-approve tasks         -> .spec/specs/{feature}/context/tasks-handoff.md
latest approved context   -> .spec/specs/{feature}/context/handoff.md
```

`sdd-context-load` defaults to compact mode and loads `handoff.md` instead of all phase documents.

Use explicit modes when needed:

```json
{ "featureName": "auth-flow", "mode": "compact" }
{ "featureName": "auth-flow", "mode": "standard" }
{ "featureName": "auth-flow", "mode": "full" }
```

- `compact`: handoff only, best for routine continuation.
- `standard`: handoff plus current `spec.json`.
- `full`: all phase documents, for audits or ambiguous decisions.

## 📋 Available MCP Tools

Once connected to your AI client, you can use these MCP tools:

| Tool | Description | Usage |
|------|-------------|--------|
| `sdd-init` | Initialize new SDD project with interactive clarification | Analyzes description quality (0-100 score), blocks if < 70%, asks targeted WHY/WHO/WHAT questions |
| `sdd-status` | Check workflow progress | Shows current phase and approvals for features |
| `sdd-approve` | Approve workflow phases | Mark phases (requirements, design, tasks) as approved |
| `sdd-review-test-cases` | Approve optional TDD test-case checkpoint | Use before approving tasks when test-case review is enabled |
| `sdd-quality-check` | Code quality analysis | Linus-style 5-layer code review |
| `sdd-context-load` | Load project context | Defaults to compact handoff context; use `mode: "full"` only when needed |
| `sdd-validate-design` | Design quality validation | Interactive GO/NO-GO design review |
| `sdd-validate-gap` | Implementation gap analysis | Analyze requirements vs codebase |
| `sdd-spec-impl` | Execute tasks with TDD | Kent Beck's Red-Green-Refactor methodology |
| `sdd-list-skills` | List available Agent Skills | Shows skills that can be installed for Claude Code |

> **Note**: Template/guidance tools (`sdd-requirements`, `sdd-design`, `sdd-tasks`, `sdd-steering`, `sdd-implement`) are now **Agent Skills**. Install them with `npx sdd-mcp-server install-skills` and use as `/sdd-requirements`, `/sdd-design`, etc.

## 💡 Basic Workflow

1. **Setup: Install Skills & Steering, Initialize Project**
   ```bash
   # Install skills and steering documents (recommended)
   npx sdd-mcp-server install

   # Initialize project with MCP tool
   Use sdd-init to create a new SDD project

   # Generate project-specific steering documents with Agent Skill
   Use /sdd-steering to generate product.md, tech.md, structure.md
   ```

2. **Generate Requirements (Agent Skill)**
   ```
   Use /sdd-requirements <feature-name> to analyze your project
   Automatically detects: language, framework, build tools, test frameworks
   Creates EARS-formatted requirements with embedded quality checklist
   Use sdd-validate-gap (MCP tool) to analyze implementation feasibility
   ```

3. **Create Design (Agent Skill)**
   ```
   Use /sdd-design <feature-name> to generate architecture
   Includes: component structure, data models, API design, Linus principles
   Use sdd-validate-design (MCP tool) for GO/NO-GO design review
   Use sdd-approve (MCP tool) to approve the design phase
   ```

4. **Plan Tasks with TDD (Agent Skill)**
   ```
   Use /sdd-tasks <feature-name> to create TDD-focused task breakdown
   Includes test pyramid guidance (70/20/10 ratio)
   Tasks follow RED-GREEN-REFACTOR workflow automatically
   Optional: enable test-case review checkpoint before implementation
   If enabled, run sdd-review-test-cases before approving tasks
   Use sdd-approve (MCP tool) to approve the tasks phase
   ```

5. **Implement with TDD (Agent Skill + MCP Tool)**
   ```
   Use /sdd-implement <feature-name> for implementation guidelines
   Use sdd-spec-impl (MCP tool) to execute tasks with TDD methodology
   Use sdd-quality-check (MCP tool) for Linus-style code review
   ```

6. **Commit Changes (Agent Skill)**
   ```
   Use /sdd-commit for commit message and PR guidelines
   Follow conventional commits format
   ```

7. **Monitor & Manage (MCP Tools)**
   ```
   Use sdd-status to check workflow progress and phase approvals
   Use sdd-context-load to restore compact project memory
   ```

## ⚙️ Configuration

### Environment Variables
```bash
# Basic configuration
export LOG_LEVEL=info          # debug, info, warn, error
export DEFAULT_LANG=en         # en, es, fr, de, it, pt, ru, ja, zh, ko

# Document generation behavior
export SDD_ALLOW_TEMPLATE_FALLBACK=false  # true to allow fallback templates when module loading fails
                                          # false (default) to fail fast with actionable errors

# Advanced configuration (optional)
export PLUGIN_DIR=/path/to/plugins
export TEMPLATE_DIR=/path/to/templates
export MAX_PLUGINS=50
export HOOK_TIMEOUT=10000
```

#### Module Loading and Fallback Behavior

By default, the SDD server requires actual codebase analysis to generate steering documents and specifications. If module loading fails (e.g., running from source without building), commands will error with helpful messages:

```bash
# Default behavior - fail fast with clear error
sdd-steering
# Error: Failed to load documentGenerator: ...
# To use template fallbacks, set SDD_ALLOW_TEMPLATE_FALLBACK=true or run 'npm run build'
```

To allow fallback templates when modules cannot be loaded:

```bash
# Allow fallback templates (useful for development/debugging)
export SDD_ALLOW_TEMPLATE_FALLBACK=true
sdd-steering
# ⚠️ Warning: Using fallback templates - documents will contain generic content
```

**Recommendation**: Keep fallback disabled in production to ensure all generated documents reflect your actual codebase.

### Claude Code Integration Example
```bash
# Install globally first
npm install -g sdd-mcp-server@latest

# Add to Claude Code with environment variables
claude mcp add sdd "sdd-mcp-server"

# Manual configuration in ~/.mcp.json:
{
  "servers": {
    "sdd": {
      "type": "stdio", 
      "command": "sdd-mcp-server",
      "args": [],
      "env": {
        "LOG_LEVEL": "info",
        "DEFAULT_LANG": "en"
      }
    }
  }
}
```

## 🏗️ Key Features

### Core SDD Workflow
- **5-Phase SDD Workflow**: INIT → REQUIREMENTS → DESIGN → TASKS → IMPLEMENTATION
- **TDD-First Task Generation**: All implementation tasks follow Test-Driven Development (RED-GREEN-REFACTOR) methodology
- **EARS-Formatted Requirements**: Generate acceptance criteria based on actual npm scripts and dependencies
- **Quality Enforcement**: Linus-style 5-layer code review system with security (OWASP Top 10) checks

### Plugin Architecture (v3.4.0)
- **6 Component Types**: Skills, Steering, Rules, Contexts, Agents, Hooks for comprehensive AI guidance
- **Specialized Agents**: Planner, Architect, Reviewer, Implementer, Security-Auditor, TDD-Guide personas
- **Always-Active Rules**: Coding-style, Testing, Security, Git-workflow, Error-handling enforcement
- **Mode-Specific Contexts**: Development, Review, Planning, Security-audit, Research modes
- **Event-Driven Hooks**: Pre/post tool-use and session lifecycle automation
- **Plugin Manifest**: `.claude-plugin/plugin.json` for Claude Code integration

### Codebase Analysis
- **Comprehensive Multi-Language Analysis**: Automatic detection of TypeScript, JavaScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala projects with framework-specific insights
- **Framework Detection**: Recognizes Spring Boot, Django, FastAPI, Flask, Rails, Laravel, Express, React, Vue, Angular, Next.js, and 20+ other frameworks
- **Architecture Pattern Recognition**: Detects DDD, MVC, Microservices, Clean Architecture patterns in your codebase
- **Context-Aware Generation**: Analyzes package.json, dependencies, build tools, test frameworks, and project structure for real content

### Guidelines & Standards
- **Coding Principles Enforcement**: Built-in SOLID, DRY, KISS, YAGNI, Separation of Concerns, and Modularity guidance
- **Project Steering Documents**: Project-specific `product.md`, `tech.md`, and `structure.md` docs, with static guidance consolidated into installable skills/rules/agents
- **Multi-Language Support**: 10 languages with cultural adaptation (en, es, fr, de, it, pt, ru, ja, zh, ko)
- **Template Engine**: Handlebars-based file generation with project-specific data
- **Plugin System**: Extensible architecture for custom workflows
- **MCP Protocol**: Full compatibility with AI-agent CLIs and IDEs

## 🔍 Example: Complete SDD Workflow

Here's how to use the MCP SDD Server in your AI client:

```bash
# 1. Initialize a new project
"Use the sdd-init tool to create a project called 'my-web-app'
 for a React/TypeScript application with user authentication"

# 2. Generate steering documents
"Use /sdd-steering to analyze my codebase and update project steering documents"
# Result: product.md, tech.md, and structure.md describe your project

# 3. Generate requirements with comprehensive analysis
"Use sdd-requirements to analyze the project and create requirements.md"
# Result: Detects TypeScript, React, npm, Jest, and generates EARS-formatted requirements

# 4. Create technical design
"Use sdd-design to generate architecture based on my React/TypeScript stack"
# Result: Component structure, state management design, API integration patterns

# 5. Validate design quality
"Use sdd-validate-design to review the architecture for potential issues"
# Result: GO/NO-GO assessment with improvement recommendations

# 6. Plan TDD-focused implementation tasks
"Use sdd-tasks to break down the work into TDD implementation phases"
# Result: Tasks organized as RED (tests) → GREEN (implementation) → REFACTOR (quality)

# 7. Implement with TDD
"Use sdd-spec-impl to execute the authentication tasks with TDD methodology"
# Result: Test-first development using installed skill and agent guidance

# 8. Review code quality
"Use sdd-quality-check to perform Linus-style code review with SOLID principles check"
# Result: 5-layer analysis + SOLID/DRY/KISS validation + security checks

# 9. Check workflow status
"Use sdd-status to check workflow progress and phase approvals"
# Result: Phase completion status and approval tracking
```

## 🛠️ Development & Troubleshooting

### Local Development
```bash
git clone https://github.com/yi-john-huang/sdd-mcp.git
cd sdd-mcp
npm install
npm run dev  # Development mode with hot reload
```

### Testing
```bash
npm test                # Run all tests
npm run test:coverage   # Run with coverage report
```

### Common Issues

**Issue: "Cannot find module sdd-mcp-server"**
```bash
# Clear npm cache and reinstall
npm cache clean --force
npm install -g sdd-mcp-server
```

**Issue: "Connection fails with npx"**

⚠️ **Known Issue**: npx execution may have timing issues with Claude Code health checks.

**Solution**: Use global installation instead:
```bash
# Don't use: npx -y sdd-mcp-server@latest
# Instead, install globally:
npm install -g sdd-mcp-server@latest
claude mcp add sdd "sdd-mcp-server" -s local
```

**Issue: "MCP server not responding or Failed to connect"**

*Fixed in v1.1.21*: Use global installation instead of npx for reliable connections.

```bash
# Install globally first
npm install -g sdd-mcp-server@latest

# Test server directly
echo '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}, "id": 1}' | sdd-mcp-server

# Check Claude MCP status
claude mcp list

# Re-add server to Claude MCP (forces refresh)
claude mcp remove sdd -s local
claude mcp add sdd "sdd-mcp-server" -s local

# Alternative: Use local development version for faster startup
git clone https://github.com/yi-john-huang/sdd-mcp.git
cd sdd-mcp
claude mcp add sdd "$(pwd)/mcp-server.js" -s local
```

**Issue: "Permission denied"**
```bash
# Fix permissions for global install
sudo npm install -g sdd-mcp-server
```

**Issue: "Only template content generated" (Improved in v1.4.3)**

As of v1.4.3, comprehensive codebase analysis is automatic with multi-language detection. Documents include real framework, build tool, and architecture information. If you still see a basic template:
- Check the tool response message — it shows "✅ Comprehensive codebase analysis" or "⚠️ Basic template (analysis failed)"
- Check the top of the generated file for warning headers with error details
- Common causes: missing package.json, permissions issues, or unsupported project structure
- Fix the issue and rerun the tool to get comprehensive analysis

## 📖 Advanced Documentation

For detailed documentation on:
- **📥 Installation Guide**: See [docs/INSTALL-GUIDE.md](docs/INSTALL-GUIDE.md) for complete CLI usage examples with real output
- **🔄 Workflow Diagrams**: See [docs/WORKFLOW.md](docs/WORKFLOW.md) for sequence diagrams showing component interactions
- **🤖 AI Agent Guide**: See [AGENTS.md](AGENTS.md) for detailed instructions on using this server with AI agents
- **🏗️ Architecture Overview**: See [ARCHITECTURE.md](ARCHITECTURE.md) for complete system design, layered architecture, module loading, and Mermaid diagrams
- **📦 Plugin Manifest**: See [.claude-plugin/plugin.json](.claude-plugin/plugin.json) for Claude Code plugin configuration
- **Plugin Development**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Docker Deployment**: See [Dockerfile](Dockerfile) and [docker-compose.yml](docker-compose.yml)

**Component Documentation (v3.4.0)**:
- **Rules**: See `rules/*.md` for always-active coding guidelines
- **Contexts**: See `contexts/*.md` for mode-specific system prompts
- **Agents**: See `agents/*.md` for specialized AI personas
- **Hooks**: See `hooks/**/*.md` for event-driven automation

**Steering Documents (v3.4.0)**:

Static steering content has been consolidated into enhanced components:
- **Design Principles**: `.claude/rules/coding-style.md` (includes SOLID, DRY, KISS, YAGNI, SoC)
- **TDD Methodology**: `.claude/agents/tdd-guide.md` (Red-Green-Refactor workflow)
- **Code Review**: `.claude/agents/reviewer.md` (Linus-style 5-layer thinking)
- **Security Checklist**: `.claude/agents/security-auditor.md` (OWASP Top 10)

The `.spec/steering/` directory now contains only project-specific templates:
- `product.md` - Product description template
- `tech.md` - Technology stack template
- `structure.md` - Project structure template

**Migration from v3.0**: Run `npx sdd-mcp-server migrate-steering` to update existing projects.

## 🐛 Support & Issues

- **GitHub Issues**: [Report bugs or request features](https://github.com/yi-john-huang/sdd-mcp/issues)
- **Repository**: [yi-john-huang/sdd-mcp](https://github.com/yi-john-huang/sdd-mcp)
- **License**: MIT

## 🚀 Quick Links

- [npm package](https://www.npmjs.com/package/sdd-mcp-server)
- [Docker image](https://ghcr.io/yi-john-huang/sdd-mcp)
- [Source code](https://github.com/yi-john-huang/sdd-mcp)
- [Issues](https://github.com/yi-john-huang/sdd-mcp/issues)

---

**Ready to get started?**
```bash
# Install globally first
npm install -g sdd-mcp-server@latest

# For Claude Code users:
claude mcp add sdd "sdd-mcp-server"

# For direct usage:
sdd-mcp-server
```

Built for the AI development community 🤖✨

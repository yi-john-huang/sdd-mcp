# MCP SDD Server

[![npm version](https://badge.fury.io/js/sdd-mcp-server.svg)](https://badge.fury.io/js/sdd-mcp-server)
[![GitHub release](https://img.shields.io/github/release/yi-john-huang/sdd-mcp.svg)](https://github.com/yi-john-huang/sdd-mcp/releases/latest)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

A Model Context Protocol (MCP) server implementing Spec-Driven Development (SDD) workflows for AI-agent CLIs and IDEs like Claude Code, Cursor, and others.

> 🔧 **v2.0.3 - CLI Subcommand Support**: `npx sdd-mcp install-skills` now works correctly! Created proper CLI entry point with subcommand support.

> 🚀 **v2.0.0 - Hybrid MCP + Agent Skills Architecture**: Restructured for token efficiency! Template/guidance tools (requirements, design, tasks, steering, implement) are now **Claude Code Agent Skills** loaded on-demand. Action-oriented tools remain as MCP tools. ~55% token savings in typical operations. Install skills with `npx sdd-mcp install-skills`.

> 🤖 **v1.8.0 - MCP Tool Standardization**: Updated `AGENTS.md` generation to use standard MCP tool calls (e.g., `sdd-init`) instead of legacy slash commands. Fixed `sdd-steering` to correctly generate `AGENTS.md` with the new format. Ensures consistent tool usage across all AI agents.

> 🔧 **v1.6.2 - Module Loading Fix**: Fixed critical bug where `sdd-steering` generated generic templates instead of analyzing actual codebases when run via `npx`. Root cause: hardcoded import paths didn't account for different execution contexts. Solution: Unified module loading system with **4-path fallback resolution** handling npm start, npm dev, node dist/index.js, and npx contexts. Comprehensive error handling with all attempted paths in error messages. Debug logging for troubleshooting. **100% test coverage** (71 tests passing, 6 new moduleLoader tests). Code review score: **9/10 (Excellent)** ✅. Production-ready with zero security issues!

> 🚀 **v1.6.0 - Architecture Refactoring**: Decomposed requirements clarification into **5 focused services** following Single Responsibility Principle! Each service now has one clear purpose: `SteeringContextLoader` (I/O), `DescriptionAnalyzer` (scored semantic detection 0-100), `QuestionGenerator` (template-based), `AnswerValidator` (validation + security), `DescriptionEnricher` (5W1H synthesis). Replaced brittle boolean regex with **scored semantic detection** for better accuracy. Externalized question templates to configuration. **62 new unit tests** (65 total passing) ✅. Services average ~100 LOC vs previous 500 LOC monolith. Better maintainability, testability, and type safety!

> 🎯 **v1.5.0 - Interactive Requirements Clarification**: `sdd-init` now **blocks vague requirements**! The agent analyzes your project description (quality score 0-100) and interactively asks targeted clarification questions if score < 70%. Focuses on **WHY** (business justification), WHO (target users), WHAT (core features), and success criteria. Context-aware using existing steering docs. Prevents "garbage in, garbage out" with enriched 5W1H structured descriptions.

> ✅ **v1.4.5**: Internal improvements! Reorganized test structure for better maintainability, centralized static steering document creation following DRY principle, improved code organization with better separation of concerns.

## 🚀 Quick Start

### Option 1: Direct NPX Usage (Recommended)
```bash
# No installation required - use directly with npx
npx -y sdd-mcp-server@latest

# Pin exact version (optional)
npx -y sdd-mcp-server@1.6.0

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
npm install -g sdd-mcp-server@1.6.0

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

## 🎯 Agent Skills (NEW in v1.9.0)

SDD now uses a **hybrid architecture** for better token efficiency:

- **MCP Tools**: Action-oriented operations (init, status, approve, quality-check, validate, spec-impl)
- **Agent Skills**: Template/guidance-heavy operations (requirements, design, tasks, steering, implement, commit)

### Installing Agent Skills

```bash
# Install skills to your project's .claude/skills/ directory
npx sdd-mcp install-skills

# Or specify a custom path
npx sdd-mcp install-skills --path ./my-skills

# List available skills
npx sdd-mcp install-skills --list
```

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

### Token Efficiency

**Old Design** (static steering): ~3,800 tokens loaded for every operation
**New Design** (skills): ~1,700 tokens loaded only when skill invoked

**Savings**: ~55% fewer tokens in typical operations!

## 📋 Available MCP Tools

Once connected to your AI client, you can use these MCP tools:

| Tool | Description | Usage |
|------|-------------|--------|
| `sdd-init` | Initialize new SDD project with interactive clarification | Analyzes description quality (0-100 score), blocks if < 70%, asks targeted WHY/WHO/WHAT questions |
| `sdd-status` | Check workflow progress | Shows current phase and approvals for features |
| `sdd-approve` | Approve workflow phases | Mark phases (requirements, design, tasks) as approved |
| `sdd-quality-check` | Code quality analysis | Linus-style 5-layer code review |
| `sdd-context-load` | Load project context | Restore project memory and state |
| `sdd-validate-design` | Design quality validation | Interactive GO/NO-GO design review |
| `sdd-validate-gap` | Implementation gap analysis | Analyze requirements vs codebase |
| `sdd-spec-impl` | Execute tasks with TDD | Kent Beck's Red-Green-Refactor methodology |
| `sdd-list-skills` | List available Agent Skills | Shows skills that can be installed for Claude Code |

> **Note**: Template/guidance tools (`sdd-requirements`, `sdd-design`, `sdd-tasks`, `sdd-steering`, `sdd-implement`) are now **Agent Skills**. Install them with `npx sdd-mcp install-skills` and use as `/sdd-requirements`, `/sdd-design`, etc.

## 💡 Basic Workflow

1. **Setup: Install Skills & Initialize Project**
   ```bash
   # Install SDD Agent Skills to your project
   npx sdd-mcp install-skills

   # Initialize project with MCP tool
   Use sdd-init to create a new SDD project

   # Generate steering documents with Agent Skill
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
   Use sdd-context-load to restore project memory
   ```

## Latest Updates (v2.0.3)

**What's New**:
- 🔧 **CLI Subcommand Support**: `npx sdd-mcp install-skills` now works correctly
- ✅ **ESM Compatibility**: Fixed path resolution for all execution contexts (npx, global, local)
- ✅ **Proper CLI Entry Point**: New `sdd-mcp-cli.ts` handles subcommands

**v2.0.0 Features** (included in this release):
- 🎯 **Hybrid MCP + Agent Skills Architecture**: Template/guidance tools moved to Claude Code Agent Skills for ~55% token savings
- ✅ **8 Agent Skills**: simple-task, sdd-requirements, sdd-design, sdd-tasks, sdd-implement, sdd-steering, sdd-steering-custom, sdd-commit
- ✅ **Skill Installation CLI**: `npx sdd-mcp install-skills` to install skills to `.claude/skills/`
- ✅ **New MCP Tool**: `sdd-list-skills` to list available skills
- ✅ **Token Efficiency**: Guidance loaded on-demand instead of always-on steering

**Upgrade Commands**:
```bash
# Install Agent Skills to your project
npx sdd-mcp install-skills

# List available skills
npx sdd-mcp install-skills --list

# Show CLI help
npx sdd-mcp --help

# MCP server (for AI client integration)
npx sdd-mcp-server
```

## Previous Versions

### v2.0.x
- v2.0.3: CLI subcommand support (`npx sdd-mcp install-skills` works)
- v2.0.2: ESM compatibility fix for install-skills CLI
- v2.0.1: Codebase simplification, removed 7,131 lines of dead code
- v2.0.0: Hybrid MCP + Agent Skills architecture, ~55% token savings

### v1.8.x
- MCP tool standardization (standard tool calls vs slash commands)
- Updated AGENTS.md generation

### v1.6.x
- Module loading fixes and architecture refactoring
- Improved requirements clarification service

### v1.5.0
- Interactive requirements clarification with 5W1H analysis

### v1.4.x
- Comprehensive codebase analysis
- TDD task generation default
- Security and principles steering documents

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

- **5-Phase SDD Workflow**: INIT → REQUIREMENTS → DESIGN → TASKS → IMPLEMENTATION
- **Comprehensive Multi-Language Analysis**: Automatic detection of TypeScript, JavaScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala projects with framework-specific insights
- **Framework Detection**: Recognizes Spring Boot, Django, FastAPI, Flask, Rails, Laravel, Express, React, Vue, Angular, Next.js, and 20+ other frameworks
- **TDD-First Task Generation**: All implementation tasks follow Test-Driven Development (RED-GREEN-REFACTOR) methodology
- **Coding Principles Enforcement**: Built-in SOLID, DRY, KISS, YAGNI, Separation of Concerns, and Modularity guidance
- **Context-Aware Generation**: Analyzes package.json, dependencies, build tools, test frameworks, and project structure for real content
- **EARS-Formatted Requirements**: Generate acceptance criteria based on actual npm scripts and dependencies
- **Architecture Pattern Recognition**: Detects DDD, MVC, Microservices, Clean Architecture patterns in your codebase
- **Quality Enforcement**: Linus-style 5-layer code review system with security (OWASP Top 10) checks
- **Comprehensive Steering Documents**: 8 auto-generated guidance docs (product, tech, structure, linus-review, commit, tdd-guideline, security-check, principles)
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
"Use sdd-steering to analyze my codebase and generate all steering documents"
# Result: 8 steering documents created including principles.md and tdd-guideline.md

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
# Result: Test-first development following principles.md and tdd-guideline.md

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
- **🤖 AI Agent Guide**: See [AGENTS.md](AGENTS.md) for detailed instructions on using this server with AI agents
- **🏗️ Architecture Overview**: See [ARCHITECTURE.md](ARCHITECTURE.md) for complete system design, layered architecture, module loading, and Mermaid diagrams
- **Plugin Development**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Docker Deployment**: See [Dockerfile](Dockerfile) and [docker-compose.yml](docker-compose.yml)
- **Code Quality Standards**: Review `.kiro/steering/linus-review.md`
- **TDD Guidelines**: See `.kiro/steering/tdd-guideline.md` for complete Test-Driven Development workflow
- **Coding Principles**: Review `.kiro/steering/principles.md` for SOLID, DRY, KISS, YAGNI, SoC, and Modularity guidance
- **Security Checklist**: Check `.kiro/steering/security-check.md` for OWASP Top 10 aligned security practices

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

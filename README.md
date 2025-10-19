# MCP SDD Server

[![npm version](https://badge.fury.io/js/sdd-mcp-server.svg)](https://badge.fury.io/js/sdd-mcp-server)
[![GitHub release](https://img.shields.io/github/release/yi-john-huang/sdd-mcp.svg)](https://github.com/yi-john-huang/sdd-mcp/releases/latest)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

A Model Context Protocol (MCP) server implementing Spec-Driven Development (SDD) workflows for AI-agent CLIs and IDEs like Claude Code, Cursor, and others.

> ✅ **v1.4.5 Update**: Internal improvements! Reorganized test structure for better maintainability, centralized static steering document creation following DRY principle, improved code organization with better separation of concerns.

> ✅ **v1.4.4**: Comprehensive codebase analysis + TDD workflow! Documents are generated with real multi-language detection (TypeScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala), framework detection (Spring Boot, Django, FastAPI, Rails, Laravel, Express, React, etc.), and architecture pattern recognition. New `principles.md` steering document enforces SOLID, DRY, KISS, YAGNI, Separation of Concerns, and Modularity. Task generation now follows Test-Driven Development (RED-GREEN-REFACTOR) workflow.

## 🚀 Quick Start

### Option 1: Direct NPX Usage (Recommended)
```bash
# No installation required - use directly with npx
npx -y sdd-mcp-server@latest

# Pin exact version (optional)
npx -y sdd-mcp-server@1.4.5

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
npm install -g sdd-mcp-server@1.4.5

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

## 📋 Available SDD Commands

Once connected to your AI client, you can use these MCP tools:

| Tool | Description | Usage |
|------|-------------|--------|
| `sdd-init` | Initialize new SDD project | Creates .kiro directory structure + AGENTS.md for cross-platform AI support |
| `sdd-requirements` | Generate context-aware requirements | Analyzes package.json and structure to create EARS-formatted requirements with comprehensive multi-language analysis |
| `sdd-design` | Create project-specific design | Generates architecture docs based on actual tech stack, dependencies, and framework detection |
| `sdd-tasks` | Generate TDD-focused task breakdown | Creates test-first implementation tasks following RED-GREEN-REFACTOR workflow |
| `sdd-implement` | Implementation guidelines | Provides implementation steering |
| `sdd-status` | Check workflow progress | Shows current phase and approvals |
| `sdd-approve` | Approve workflow phases | Mark phases as approved for progression |
| `sdd-quality-check` | Code quality analysis | Linus-style 5-layer code review |
| `sdd-context-load` | Load project context | Restore project memory and state |
| `sdd-template-render` | Render templates | Generate files from templates |
| `sdd-steering` | Create/update steering docs | Analyzes project to generate product.md, tech.md, structure.md + static docs: linus-review.md, commit.md, security-check.md, tdd-guideline.md, principles.md (SOLID/DRY/KISS/YAGNI/SoC/Modularity) |
| `sdd-steering-custom` | Create custom steering docs | Add specialized guidance documents |
| `sdd-validate-design` | Design quality validation | Interactive GO/NO-GO design review |
| `sdd-validate-gap` | Implementation gap analysis | Analyze requirements vs codebase |
| `sdd-spec-impl` | Execute tasks with TDD | Kent Beck's Red-Green-Refactor methodology |

## 💡 Basic Workflow

1. **Initialize Project & Steering**
   ```
   Use sdd-init to create a new SDD project
   Use sdd-steering to generate 8 steering documents:
     - product.md, tech.md, structure.md (dynamic, analyzed from codebase)
     - linus-review.md, commit.md, security-check.md (static quality standards)
     - tdd-guideline.md (Test-Driven Development workflow)
     - principles.md (SOLID, DRY, KISS, YAGNI, SoC, Modularity)
   ```

2. **Generate Requirements**
   ```
   Use sdd-requirements to analyze your project with comprehensive multi-language detection
   Automatically detects: language, framework, build tools, test frameworks, architecture patterns
   Creates EARS-formatted requirements based on actual project context
   Use sdd-validate-gap to analyze implementation feasibility
   ```

3. **Create Design**
   ```
   Use sdd-design to generate architecture based on detected tech stack
   Includes: component structure, data models, API design, tech stack details
   Use sdd-validate-design for GO/NO-GO design review
   ```

4. **Plan Tasks with TDD**
   ```
   Use sdd-tasks to create TDD-focused implementation breakdown
   Tasks follow RED-GREEN-REFACTOR workflow automatically
   Phases: Test Setup → Implementation → Refactoring → Integration
   ```

5. **Implement with TDD**
   ```
   Use sdd-spec-impl to execute tasks with Test-Driven Development
   Follow the generated TDD workflow from tdd-guideline.md
   Use sdd-quality-check for Linus-style code review and SOLID principles validation
   ```

6. **Monitor & Manage**
   ```
   Use sdd-status to check workflow progress and phase approvals
   Use sdd-approve to mark phases as approved
   Use sdd-context-load to restore project memory
   ```

## Upgrading to 1.4.4

**What's New in v1.4.4**:
- ✅ **Comprehensive Codebase Analysis**: Documents now generated with full multi-language detection (TypeScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala)
- ✅ **Framework Detection**: Automatic recognition of Spring Boot, Django, FastAPI, Rails, Laravel, Express, React, Vue, Angular, Next.js, and 20+ frameworks
- ✅ **Build Tool & Test Framework Detection**: Identifies Maven, Gradle, npm, pip, cargo, Jest, pytest, JUnit, Mocha, and more
- ✅ **Architecture Pattern Recognition**: Detects DDD, MVC, Microservices, and Clean Architecture patterns
- ✅ **New Steering Document**: `principles.md` added with comprehensive SOLID, DRY, KISS, YAGNI, Separation of Concerns, and Modularity guidance
- ✅ **TDD Task Generation**: All implementation tasks now follow Test-Driven Development (RED-GREEN-REFACTOR) workflow
- ✅ **Improved Error Handling**: Better logging and debug messages for analysis failures
- ✅ **User Feedback**: Clear indication whether comprehensive analysis or fallback template was used

**Upgrade Commands**:
```bash
# Prefer npx (no installation required)
npx -y sdd-mcp-server@latest

# Or pin to specific version
npx -y sdd-mcp-server@1.4.4

# Global installation
npm install -g sdd-mcp-server@latest
# Or pin: npm install -g sdd-mcp-server@1.4.4
```

**Migration Notes**:
- If you pinned a version in your MCP config, update it to `@latest` or `@1.4.4`
- All steering documents now include `principles.md` and `tdd-guideline.md` automatically
- TDD task generation is now default - tasks will follow RED-GREEN-REFACTOR order
- No code changes needed - all improvements are backward compatible

## Previous Versions

### v1.4.3
- Comprehensive codebase analysis fix for document generation
- Enhanced multi-language and framework detection
- Better error reporting and user feedback

### v1.4.2
- Added `tdd-guideline.md` steering document for TDD enforcement
- Security-check.md (OWASP Top 10) included in static steering docs

### v1.4.0
- Analysis-based document generation on first run (no more template-first step)
- Dynamic steering with static exceptions (`linus-review.md`, `commit.md`)
- Node.js >= 18 required

## ⚙️ Configuration

### Environment Variables
```bash
# Basic configuration
export LOG_LEVEL=info          # debug, info, warn, error
export DEFAULT_LANG=en         # en, es, fr, de, it, pt, ru, ja, zh, ko

# Advanced configuration (optional)
export PLUGIN_DIR=/path/to/plugins
export TEMPLATE_DIR=/path/to/templates
export MAX_PLUGINS=50
export HOOK_TIMEOUT=10000
```

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
"Use sdd-status to see current progress and approvals"
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
- **Plugin Development**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Docker Deployment**: See [Dockerfile](Dockerfile) and [docker-compose.yml](docker-compose.yml)
- **Architecture Details**: Explore the `/src` directory structure
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

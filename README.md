# MCP SDD Server

A Model Context Protocol (MCP) server implementing Spec-Driven Development (SDD) workflows for AI-agent CLIs and IDEs like Claude Code, Cursor, and others.

## 🚀 Quick Start

### Option 1: Install with npx (Recommended)
```bash
# Run directly without installation
npx @sdd/mcp-server

# Or install globally
npm install -g @sdd/mcp-server
sdd-mcp-server
```

### Option 2: Clone and Run
```bash
# Clone the repository
git clone https://github.com/yi-john-huang/sdd-mcp.git
cd sdd-mcp

# Install and start
npm install
npm run build
npm start
```

### Option 3: Docker
```bash
# Run with Docker
docker run -p 3000:3000 ghcr.io/yi-john-huang/sdd-mcp:latest

# Or with Docker Compose
curl -O https://raw.githubusercontent.com/yi-john-huang/sdd-mcp/develop/docker-compose.yml
docker-compose up -d
```

## 🔧 Configuration for AI Clients

### Claude Code
Add to your MCP settings:
```json
{
  "mcpServers": {
    "sdd": {
      "command": "npx",
      "args": ["@sdd/mcp-server"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Cursor IDE  
Add to your MCP configuration:
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
sdd-mcp-server
```

## 📋 Available SDD Commands

Once connected to your AI client, you can use these MCP tools:

| Tool | Description | Usage |
|------|-------------|--------|
| `sdd-init` | Initialize new SDD project | Creates .kiro directory structure |
| `sdd-requirements` | Generate requirements doc | Creates requirements.md from project analysis |
| `sdd-design` | Create design specifications | Generates design.md with architecture |
| `sdd-tasks` | Generate task breakdown | Creates tasks.md with implementation plan |
| `sdd-implement` | Implementation guidelines | Provides implementation steering |
| `sdd-status` | Check workflow progress | Shows current phase and approvals |
| `sdd-approve` | Approve workflow phases | Mark phases as approved for progression |
| `sdd-quality-check` | Code quality analysis | Linus-style 5-layer code review |
| `sdd-context-load` | Load project context | Restore project memory and state |
| `sdd-template-render` | Render templates | Generate files from templates |

## 💡 Basic Workflow

1. **Initialize Project**
   ```
   Use sdd-init to create a new SDD project
   ```

2. **Generate Requirements**
   ```
   Use sdd-requirements to analyze and document requirements
   ```

3. **Create Design**
   ```
   Use sdd-design to generate technical architecture
   ```

4. **Plan Tasks**
   ```
   Use sdd-tasks to break down implementation work
   ```

5. **Implement**
   ```
   Use sdd-implement for implementation guidance
   ```

6. **Quality Check**
   ```
   Use sdd-quality-check for code review and analysis
   ```

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
```json
{
  "mcpServers": {
    "sdd": {
      "command": "npx",
      "args": ["@sdd/mcp-server"],
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
- **Quality Enforcement**: Linus-style 5-layer code review system
- **Multi-Language Support**: 10 languages with cultural adaptation
- **Template Engine**: Handlebars-based file generation
- **Plugin System**: Extensible architecture for custom workflows
- **MCP Protocol**: Full compatibility with AI-agent CLIs and IDEs

## 🔍 Example: Complete SDD Workflow

Here's how to use the MCP SDD Server in your AI client:

```bash
# 1. Initialize a new project
"Use the sdd-init tool to create a project called 'my-web-app'"

# 2. Generate requirements
"Use sdd-requirements to analyze the project and create requirements.md"

# 3. Create technical design
"Use sdd-design to generate architecture and design specifications"

# 4. Plan implementation tasks
"Use sdd-tasks to break down the work into implementable tasks"

# 5. Get implementation guidance
"Use sdd-implement to provide implementation steering and best practices"

# 6. Review code quality
"Use sdd-quality-check to perform Linus-style code review on my components"
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

**Issue: "Cannot find module @sdd/mcp-server"**
```bash
# Clear npm cache and reinstall
npm cache clean --force
npm install -g @sdd/mcp-server
```

**Issue: "MCP server not responding"**
```bash
# Check if server is running
ps aux | grep sdd-mcp-server

# Check logs with debug level
LOG_LEVEL=debug npx @sdd/mcp-server
```

**Issue: "Permission denied"**
```bash
# Fix permissions for global install
sudo npm install -g @sdd/mcp-server
```

## 📖 Advanced Documentation

For detailed documentation on:
- Plugin Development: See [DEPLOYMENT.md](DEPLOYMENT.md)
- Docker Deployment: See [Dockerfile](Dockerfile) and [docker-compose.yml](docker-compose.yml)
- Architecture Details: Explore the `/src` directory structure
- Quality Analysis: Review `.kiro/steering/linus-review.md`

## 🐛 Support & Issues

- **GitHub Issues**: [Report bugs or request features](https://github.com/yi-john-huang/sdd-mcp/issues)
- **Repository**: [yi-john-huang/sdd-mcp](https://github.com/yi-john-huang/sdd-mcp)
- **License**: MIT

## 🚀 Quick Links

- [npm package](https://www.npmjs.com/package/@sdd/mcp-server)
- [Docker image](https://ghcr.io/yi-john-huang/sdd-mcp)
- [Source code](https://github.com/yi-john-huang/sdd-mcp)
- [Issues](https://github.com/yi-john-huang/sdd-mcp/issues)

---

**Ready to get started?**
```bash
npx @sdd/mcp-server
```

Built for the AI development community 🤖✨
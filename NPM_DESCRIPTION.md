# MCP SDD Server - npm Package Description

## Short Description (for package.json)

```
MCP server for spec-driven development workflows across AI-agent CLIs and IDEs. Provides interactive requirements clarification, steering document generation, and workflow state management with comprehensive codebase analysis.
```

## Long Description (for npmjs.com)

### Model Context Protocol Server for Spec-Driven Development

**MCP SDD Server** is a production-ready Model Context Protocol (MCP) server that brings structured, test-driven development workflows to AI-agent CLIs like Claude Code and Cursor IDE.

#### ✨ Key Features

- **🔧 v1.6.2 - Cross-Context Module Loading**: Fixed critical bug with unified module loading system. Works flawlessly with npx, npm, node, and Docker execution contexts. 100% test coverage, 9/10 code review score.

- **🎯 Interactive Requirements Clarification**: Automatically analyzes project descriptions (quality score 0-100) and interactively gathers missing information if score < 70%. Focuses on WHY (business justification), WHO (target users), WHAT (core features), and success criteria.

- **📚 Comprehensive Codebase Analysis**: Multi-language detection (TypeScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala), framework detection (Spring Boot, Django, FastAPI, Rails, Laravel, Express, React, Vue), and architecture pattern recognition (DDD, MVC, Microservices).

- **🔄 Workflow State Management**: Guides teams through Requirements → Design → Tasks → Implementation phases with approval gates and validation.

- **🔌 Plugin System**: Extensible architecture supporting custom tools, steering documents, and workflow hooks.

#### 🚀 Quick Start

```bash
# No installation required - use directly with npx
npx -y sdd-mcp-server@latest

# Or install globally
npm install -g sdd-mcp-server@latest
sdd-mcp-server
```

#### 🔧 AI Client Configuration

**Claude Code:**
```bash
claude mcp add sdd -s local -- npx -y sdd-mcp-server@latest
```

**Cursor IDE:** Add to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "sdd": {
      "command": "npx",
      "args": ["-y", "sdd-mcp-server@latest"]
    }
  }
}
```

#### 📋 Available SDD Tools

1. **sdd-init**: Initialize new specification with interactive clarification
2. **sdd-steering**: Generate steering documents from codebase analysis
3. **sdd-requirements**: Create requirements.md with user stories
4. **sdd-design**: Generate design.md with architecture decisions
5. **sdd-tasks**: Break down into implementable tasks
6. **sdd-implement**: Implementation guidelines and validation
7. **sdd-status**: Check workflow progress and phase status
8. **sdd-approve**: Approve workflow phases (requirements/design/tasks)
9. **sdd-quality-check**: Code quality analysis with Linus-style review
10. **sdd-validate-design**: Interactive design quality review
11. **sdd-validate-gap**: Implementation gap analysis
12. **sdd-spec-impl**: Execute tasks with TDD methodology

#### 🏗️ Architecture

- **Layered Architecture**: Domain-Driven Design with clear separation
- **SOLID Principles**: Single Responsibility, Dependency Inversion
- **100% Type Safety**: Full TypeScript with strict mode
- **Test Coverage**: 71 tests passing, 100% coverage for critical paths
- **Security**: OWASP Top 10 aligned, input sanitization, least privilege

#### 📊 Performance

- Module loading: <100ms worst case
- Document generation: ~1 second end-to-end
- Memory footprint: 40-60 MB typical usage
- Zero external dependencies for core functionality

#### 🔒 Security Features

- **Distroless Docker Image**: Minimal attack surface (gcr.io/distroless/nodejs18)
- **Non-root Execution**: Runs as UID 1001
- **Input Sanitization**: XSS/injection prevention
- **Path Traversal Prevention**: Secure file operations
- **Read-only Filesystem**: Immutable container runtime

#### 💡 Use Cases

- **AI-Assisted Development**: Structure AI agent interactions with formal specifications
- **Documentation Generation**: Auto-generate context-rich docs from codebase
- **Requirements Engineering**: Interactive clarification prevents vague requirements
- **Team Onboarding**: Comprehensive project context for new developers
- **Quality Gates**: Enforce standards through workflow validation

#### 📖 Documentation

- **Architecture Guide**: [ARCHITECTURE.md](https://github.com/yi-john-huang/sdd-mcp/blob/master/ARCHITECTURE.md) - Complete system design with Mermaid diagrams
- **Code Review**: [CODE_REVIEW.md](https://github.com/yi-john-huang/sdd-mcp/blob/master/CODE_REVIEW.md) - Linus-style quality analysis
- **Deployment**: [DEPLOYMENT.md](https://github.com/yi-john-huang/sdd-mcp/blob/master/DEPLOYMENT.md) - Docker, npm, and plugin development
- **Changelog**: [CHANGELOG.md](https://github.com/yi-john-huang/sdd-mcp/blob/master/CHANGELOG.md) - Version history

#### 🧪 Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# With coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
```

#### 🐛 Troubleshooting

**Issue: Module loading errors**
- **v1.6.2 fix**: Unified module loader now handles all execution contexts
- Check debug logs: `[SDD-DEBUG] ✅ Loaded documentGenerator from: {path}`
- Error messages show all attempted paths for diagnosis

**Issue: Generic template documents**
- **v1.6.2 fix**: Now properly analyzes codebases in all contexts
- Verify package.json exists in project root
- Check file permissions (read access required)

**Issue: MCP connection failures**
- Verify MCP client configuration (correct command/args)
- Check Node.js version (>=18.0.0 required)
- Review error logs for specific failure reason

#### 🌟 Version History

- **v1.6.2** (2025-11-05): Unified module loading system, cross-context compatibility
- **v1.6.1** (2025-10-30): Documentation updates, README improvements
- **v1.6.0** (2025-10-28): Architecture refactoring, 5 focused services
- **v1.5.0** (2025-10-20): Interactive requirements clarification
- **v1.4.5** (2025-10-15): Test structure reorganization, static steering improvements
- **v1.4.4** (2025-10-10): Plugin system enhancements
- **v1.4.3** (2025-10-05): Comprehensive codebase analysis
- **v1.4.0** (2025-09-28): MCP protocol integration

#### 🤝 Contributing

Contributions welcome! Please follow:
- **TDD Workflow**: Red → Green → Refactor
- **Code Quality**: Linus-style review standards
- **Documentation**: Update ARCHITECTURE.md for structural changes
- **Testing**: Maintain 100% coverage for critical paths

#### 📄 License

MIT License - see [LICENSE](https://github.com/yi-john-huang/sdd-mcp/blob/master/LICENSE)

#### 🔗 Links

- **GitHub**: https://github.com/yi-john-huang/sdd-mcp
- **Issues**: https://github.com/yi-john-huang/sdd-mcp/issues
- **npm**: https://www.npmjs.com/package/sdd-mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io

#### 💬 Support

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and community support
- **Email**: See GitHub profile for contact information

---

**Built for the AI development community** 🤖✨

**Made with ❤️ using Test-Driven Development**

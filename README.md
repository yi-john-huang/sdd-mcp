# MCP SDD Server

A comprehensive Model Context Protocol (MCP) server implementing Spec-Driven Development (SDD) workflows for AI-agent CLIs and IDEs.

## Features

### 🔄 5-Phase SDD Workflow State Machine
- **INIT → REQUIREMENTS → DESIGN → TASKS → IMPLEMENTATION**
- Cross-phase validation with approval gates
- Rollback support for iterative development
- Progress tracking and metrics

### 🏗️ Clean Architecture & Dependency Injection
- Hexagonal/Ports & Adapters pattern
- Inversify container with TypeScript decorators
- Domain-driven design principles
- Infrastructure abstractions

### 🔌 Dynamic Plugin System
- Hot-loadable plugins with lifecycle management
- Hook system with priority-based execution
- Tool registry with permission management
- Steering document integration

### 📊 Linus-Style Quality Enforcement
- 5-layer code analysis framework
- AST parsing and complexity analysis
- Automated code review suggestions
- Quality gate integration

### 🌍 Multi-Language Support
- 10 supported languages with i18next
- Cultural adaptation beyond translation
- Context-aware localization
- Platform-specific formatting

### 📝 Handlebars Template Engine
- Template inheritance and composition
- Custom helpers and partials
- Dynamic file generation
- Project scaffolding automation

### 🎛️ Steering Document System
- Always/Conditional/Manual modes
- Pattern-based activation
- Priority conflict resolution
- Dynamic context injection

## Architecture

```
src/
├── domain/                 # Domain models and ports
│   ├── ports.ts           # Infrastructure abstractions
│   ├── types.ts           # Core domain types
│   ├── context/           # Project context management
│   ├── i18n/              # Internationalization types
│   ├── plugins/           # Plugin system types
│   ├── quality/           # Quality analysis types
│   └── templates/         # Template system types
├── application/           # Application services
│   └── services/          # Business logic implementation
├── infrastructure/        # Infrastructure adapters
│   ├── adapters/          # External service adapters
│   ├── di/                # Dependency injection setup
│   ├── i18n/              # i18next implementation
│   ├── mcp/               # MCP protocol implementation
│   ├── plugins/           # Plugin system infrastructure
│   ├── quality/           # Quality analysis implementation
│   └── templates/         # Template engine implementation
└── __tests__/             # Comprehensive test suite
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd sdd-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## Usage

### As MCP Server
```bash
# Start the MCP server
npm start

# Or run directly
node dist/index.js
```

### Configuration

The server supports various configuration options through environment variables:

```bash
# Set log level
export LOG_LEVEL=debug

# Set plugin directory
export PLUGIN_DIR=/path/to/plugins

# Set template directory
export TEMPLATE_DIR=/path/to/templates

# Set default language
export DEFAULT_LANG=en
```

## MCP Tools

The server provides the following MCP tools:

### Core Workflow Tools
- `sdd-init` - Initialize new SDD project
- `sdd-requirements` - Generate requirements documentation
- `sdd-design` - Create design specifications
- `sdd-tasks` - Generate task breakdown
- `sdd-implement` - Implementation guidelines
- `sdd-status` - Check workflow progress
- `sdd-approve` - Approve workflow phases

### Quality & Context Tools
- `sdd-quality-check` - Perform code quality analysis
- `sdd-context-load` - Load project context
- `sdd-template-render` - Render templates

## Plugin Development

### Creating a Plugin

1. Create plugin manifest (`plugin.json`):
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "hooks": [],
  "tools": [],
  "steeringDocuments": []
}
```

2. Implement plugin logic:
```typescript
export class MyPlugin implements PluginInterface {
  async initialize(): Promise<void> {
    // Plugin initialization
  }

  async executeHook(hookName: string, context: HookContext): Promise<HookResult> {
    // Hook implementation
  }
}
```

### Hook Types
- **FILTER** - Transform data
- **ACTION** - Perform side effects
- **VALIDATOR** - Validate input
- **TRANSFORMER** - Convert formats
- **OBSERVER** - Monitor events

### Hook Phases
- PRE_INIT, POST_INIT
- PRE_REQUIREMENTS, POST_REQUIREMENTS
- PRE_DESIGN, POST_DESIGN
- PRE_TASKS, POST_TASKS
- PRE_IMPLEMENTATION, POST_IMPLEMENTATION

## Steering Documents

Steering documents provide AI guidance throughout the development process:

### Always Mode
Loaded in every interaction:
```yaml
name: coding-standards
type: TECHNICAL
mode: ALWAYS
template: |
  Follow TypeScript strict mode
  Use ESLint configuration
  Implement proper error handling
```

### Conditional Mode
Loaded for specific patterns:
```yaml
name: test-guidelines
type: QUALITY
mode: CONDITIONAL
patterns: ["*.test.ts", "**/__tests__/**"]
template: |
  Write comprehensive test coverage
  Use describe/it structure
  Mock external dependencies
```

### Manual Mode
Reference with @filename.md syntax:
```yaml
name: deployment-guide
type: OPERATIONAL
mode: MANUAL
template: |
  Deployment checklist:
  - Run tests
  - Update version
  - Create release notes
```

## Quality Analysis

The Linus-style quality analyzer provides 5-layer analysis:

1. **Syntax Layer** - Code structure and formatting
2. **Logic Layer** - Algorithm complexity and flow
3. **Architecture Layer** - Design patterns and organization  
4. **Performance Layer** - Efficiency and optimization
5. **Maintainability Layer** - Code clarity and documentation

## Internationalization

Supported languages:
- English (en) - Default
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Japanese (ja)
- Chinese (zh)
- Korean (ko)

Messages are culturally adapted, not just translated:
```typescript
// Date formatting adapts to locale
en: "Created on {date, date, short}"
de: "Erstellt am {date, date, short}"
ja: "{date, date, short}に作成"
```

## Template System

### Template Categories
- PROJECT - Full project scaffolding
- COMPONENT - Individual component templates
- DOCUMENTATION - Documentation templates
- CONFIGURATION - Config file templates
- TEST - Test file templates
- UTILITY - Helper and utility templates

### Custom Helpers
```handlebars
{{#each components}}
  {{capitalize name}}: {{pascalCase name}}Component
{{/each}}

{{formatDate createdAt "YYYY-MM-DD"}}
{{pluralize items.length "item"}}
```

## Development

### Running Tests
```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Type Checking
```bash
npm run typecheck
```

## Deployment

### Production Build
```bash
npm run build:production
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Variables
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- `PLUGIN_DIR` - Plugin directory path
- `TEMPLATE_DIR` - Template directory path
- `DEFAULT_LANG` - Default language code
- `MAX_PLUGINS` - Maximum concurrent plugins
- `HOOK_TIMEOUT` - Hook execution timeout (ms)

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Write comprehensive tests
- Update documentation
- Follow conventional commits
- Ensure quality gates pass

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- GitHub Issues: Report bugs and request features
- Documentation: Comprehensive guides and API reference
- Community: Discord server for discussions

---

Built with ❤️ for the AI development community
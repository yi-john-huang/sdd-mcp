# Technology Stack

## Architecture
- **Type**: Node.js Application
- **Runtime**: Node.js with ES modules
- **Protocol**: Model Context Protocol (MCP) for AI integration
- **Package Manager**: npm

## Technology Stack
- **@babel/parser**: Runtime dependency
- **@babel/types**: Runtime dependency
- **@modelcontextprotocol/sdk**: Runtime dependency
- **@typescript-eslint/typescript-estree**: Runtime dependency
- **acorn**: Runtime dependency
- **ajv**: Runtime dependency
- **ajv-formats**: Runtime dependency
- **esprima**: Runtime dependency
- **handlebars**: Runtime dependency
- **i18next**: Runtime dependency

## Development Environment
- **Node Version**: >= 18.0.0
- **Package Manager**: npm
- **Module System**: ES modules (type: "module")

## Common Commands
```bash
# Development
npm install          # Install dependencies
npm run build       # Build the project
npm test           # Run tests
npm start          # Start the application

# MCP Server
node mcp-server.js  # Run simple MCP server
```

## Environment Variables
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `DEFAULT_LANG`: Default language for generated documents (en, es, fr, etc.)

## Port Configuration
- MCP Server: Uses stdio transport (no ports)
- Application ports: Defined by implementation requirements
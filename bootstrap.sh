#!/bin/sh
if ! command -v npx >/dev/null 2>&1; then
  printf '%s\n' 'sdd-mcp setup requires npx (Node.js/npm).' >&2
  exit 1
fi
exec npx -y "${SDD_MCP_PACKAGE:-sdd-mcp-server@latest}" setup-global "$@"

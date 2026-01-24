# SDD-MCP Installation Guide

This guide shows you how to install and use the SDD-MCP components in your project.

## Quick Start

```bash
# Install all SDD components to your project
npx sdd-mcp-server install --all
```

This installs 41 files across 6 component types to help guide AI-assisted development.

---

## Available Commands

### List Available Components

```bash
npx sdd-mcp-server install --list
```

**Output:**
```
📚 Available Skills:

  • sdd-commit
    Guide commit message and PR creation for SDD workflow.

  • sdd-design
    Create technical design specifications for SDD workflow.

  • sdd-implement
    Implementation guidelines for SDD workflow.

  • sdd-requirements
    Generate EARS-formatted requirements for SDD workflow.

  • sdd-review
    Perform thorough Linus-style code review.

  • sdd-security-check
    Perform OWASP-aligned security audit of code.

  • sdd-steering
    Create project-specific steering documents.

  • sdd-steering-custom
    Create custom steering documents for specialized contexts.

  • sdd-tasks
    Generate TDD task breakdown for SDD workflow.

  • sdd-test-gen
    Generate comprehensive tests following TDD methodology.

  • simple-task
    Implement simple features with best practices.

  Total: 11 skills

📄 Steering Documents:

  • AGENTS.md
  • commit.md
  • linus-review.md
  • owasp-top10-check.md
  • principles.md
  • tdd-guideline.md

  Total: 6 documents

📏 Rules:

  • coding-style (priority: 100)
  • error-handling (priority: 90)
  • git-workflow (priority: 80)
  • sdd-workflow (priority: 85)
  • security (priority: 99)
  • testing (priority: 95)

  Total: 6 rules

🎭 Contexts:

  • dev (mode: dev)
  • planning (mode: planning)
  • research (mode: research)
  • review (mode: review)
  • security-audit (mode: security-audit)

  Total: 5 contexts

🤖 Agents:

  • architect (architect)
  • implementer (implementer)
  • planner (planner)
  • reviewer (reviewer)
  • security-auditor (security-auditor)
  • tdd-guide (tdd-guide)

  Total: 6 agents

🪝 Hooks:

  post-tool-use/
    ○ log-tool-execution
    ✓ update-spec-status
  pre-tool-use/
    ✓ check-test-coverage
    ✓ validate-sdd-workflow
  session-end/
    ✓ remind-uncommitted-changes
    ✓ save-session-summary
  session-start/
    ✓ load-project-context

  Total: 7 hooks
```

---

### Install All Components

```bash
npx sdd-mcp-server install --all
```

**Output:**
```
🚀 SDD Component Installer

📦 Installing SDD skills to: .claude/skills

✅ Installed 11 skills:
   • sdd-commit
   • sdd-design
   • sdd-implement
   • sdd-requirements
   • sdd-review
   • sdd-security-check
   • sdd-steering
   • sdd-steering-custom
   • sdd-tasks
   • sdd-test-gen
   • simple-task

🎉 Skills installed successfully!
   Use /sdd-requirements, /sdd-design, etc. in Claude Code.

📄 Installing steering documents to: .spec/steering

✅ Installed 6 steering documents:
   • AGENTS.md
   • commit.md
   • linus-review.md
   • owasp-top10-check.md
   • principles.md
   • tdd-guideline.md

🎉 Steering documents installed successfully!

📏 Installing rules to: .claude/rules

✅ Installed 6 rules:
   • coding-style
   • error-handling
   • git-workflow
   • sdd-workflow
   • security
   • testing

🎭 Installing contexts to: .claude/contexts

✅ Installed 5 contexts:
   • dev
   • planning
   • research
   • review
   • security-audit

🤖 Installing agents to: .claude/agents

✅ Installed 6 agents:
   • architect
   • implementer
   • planner
   • reviewer
   • security-auditor
   • tdd-guide

🪝 Installing hooks to: .claude/hooks

✅ Installed 7 hooks:
   • log-tool-execution
   • update-spec-status
   • check-test-coverage
   • validate-sdd-workflow
   • remind-uncommitted-changes
   • save-session-summary
   • load-project-context

✨ Installation complete!
```

---

### Install Specific Components

You can install only the components you need:

```bash
# Install only skills and rules
npx sdd-mcp-server install --skills --rules
```

**Output:**
```
🚀 SDD Component Installer

📦 Installing SDD skills to: .claude/skills

✅ Installed 11 skills:
   • sdd-commit
   • sdd-design
   • sdd-implement
   • sdd-requirements
   • sdd-review
   • sdd-security-check
   • sdd-steering
   • sdd-steering-custom
   • sdd-tasks
   • sdd-test-gen
   • simple-task

🎉 Skills installed successfully!
   Use /sdd-requirements, /sdd-design, etc. in Claude Code.

📏 Installing rules to: .claude/rules

✅ Installed 6 rules:
   • coding-style
   • error-handling
   • git-workflow
   • sdd-workflow
   • security
   • testing

✨ Installation complete!
```

---

## Installed Directory Structure

After running `install --all`, your project will have:

```
your-project/
├── .claude/
│   ├── skills/                    # 11 workflow skills
│   │   ├── sdd-commit/SKILL.md
│   │   ├── sdd-design/SKILL.md
│   │   ├── sdd-implement/SKILL.md
│   │   ├── sdd-requirements/SKILL.md
│   │   ├── sdd-review/SKILL.md          # NEW in v3.0
│   │   ├── sdd-security-check/SKILL.md  # NEW in v3.0
│   │   ├── sdd-steering/SKILL.md
│   │   ├── sdd-steering-custom/SKILL.md
│   │   ├── sdd-tasks/SKILL.md
│   │   ├── sdd-test-gen/SKILL.md        # NEW in v3.0
│   │   └── simple-task/SKILL.md
│   │
│   ├── rules/                     # 6 always-active rules
│   │   ├── coding-style.md
│   │   ├── error-handling.md
│   │   ├── git-workflow.md
│   │   ├── sdd-workflow.md
│   │   ├── security.md
│   │   └── testing.md
│   │
│   ├── contexts/                  # 5 mode-specific contexts
│   │   ├── dev.md
│   │   ├── planning.md
│   │   ├── research.md
│   │   ├── review.md
│   │   └── security-audit.md
│   │
│   ├── agents/                    # 6 specialized agents
│   │   ├── architect.md
│   │   ├── implementer.md
│   │   ├── planner.md
│   │   ├── reviewer.md
│   │   ├── security-auditor.md
│   │   └── tdd-guide.md
│   │
│   └── hooks/                     # 7 event-driven hooks
│       ├── pre-tool-use/
│       │   ├── check-test-coverage.md
│       │   └── validate-sdd-workflow.md
│       ├── post-tool-use/
│       │   ├── log-tool-execution.md
│       │   └── update-spec-status.md
│       ├── session-start/
│       │   └── load-project-context.md
│       └── session-end/
│           ├── remind-uncommitted-changes.md
│           └── save-session-summary.md
│
└── .spec/
    └── steering/                  # 6 project steering docs
        ├── AGENTS.md
        ├── commit.md
        ├── linus-review.md
        ├── owasp-top10-check.md
        ├── principles.md
        └── tdd-guideline.md
```

---

## CLI Options Reference

```
SDD Unified Installer

Usage: npx sdd-mcp-server install [options]

Component Options (install specific types):
  --skills              Install skills only (to .claude/skills)
  --steering            Install steering documents only (to .spec/steering)
  --rules               Install rules only (to .claude/rules)
  --contexts            Install contexts only (to .claude/contexts)
  --agents              Install agents only (to .claude/agents)
  --hooks               Install hooks only (to .claude/hooks)
  --all                 Install all component types (default behavior)

Path Options (customize installation targets):
  --path <dir>          Target for skills (default: .claude/skills)
  --steering-path <dir> Target for steering (default: .spec/steering)
  --rules-path <dir>    Target for rules (default: .claude/rules)
  --contexts-path <dir> Target for contexts (default: .claude/contexts)
  --agents-path <dir>   Target for agents (default: .claude/agents)
  --hooks-path <dir>    Target for hooks (default: .claude/hooks)

Other Options:
  --list, -l            List all available components
  --help, -h            Show this help message
```

---

## Component Types Explained

| Component | Purpose | Example Usage |
|-----------|---------|---------------|
| **Skills** | Workflow guidance invoked with `/command` | `/sdd-requirements my-feature` |
| **Steering** | Project-wide conventions auto-loaded | Automatically provides context |
| **Rules** | Always-active guidelines | Enforces coding style, security |
| **Contexts** | Mode-specific prompts | Switch to `review` mode for code review |
| **Agents** | Specialized AI personas | Use `reviewer` for Linus-style feedback |
| **Hooks** | Event automation | Auto-validates SDD workflow order |

---

## Using Skills in Claude Code

After installation, use these skills:

```bash
# SDD Workflow Skills
/sdd-requirements my-feature    # Generate requirements
/sdd-design my-feature          # Create technical design
/sdd-tasks my-feature           # Generate TDD task breakdown
/sdd-implement my-feature       # Implementation guidelines

# New in v3.0
/sdd-review src/api/handler.ts  # Linus-style code review
/sdd-security-check src/        # OWASP security audit
/sdd-test-gen src/utils.ts      # Generate TDD tests

# Utility Skills
/sdd-steering                   # Generate steering docs
/sdd-steering-custom            # Create custom steering
/sdd-commit                     # Commit/PR guidelines
/simple-task fix the login bug  # Quick implementation
```

---

## Backward Compatibility

The v3.0 installer is fully backward compatible:

```bash
# These all still work:
npx sdd-mcp-server install              # Installs skills + steering (v2.x behavior)
npx sdd-mcp-server install --skills     # Skills only
npx sdd-mcp-server install --steering   # Steering only
npx sdd-mcp-server install-skills       # Legacy command
```

---

## Troubleshooting

### Components not installing

If components fail to install, check:

1. **Permissions**: Ensure you have write access to the target directories
2. **Node version**: Requires Node.js 18+
3. **npm cache**: Try `npm cache clean --force` then reinstall

### Skills not showing in Claude Code

After installation:

1. Restart Claude Code or refresh the session
2. Check that `.claude/skills/` directory exists in your project
3. Verify skill files have `SKILL.md` filename

### Custom installation paths

```bash
# Install to custom locations
npx sdd-mcp-server install --all \
  --path ./custom/skills \
  --steering-path ./custom/steering \
  --rules-path ./custom/rules \
  --contexts-path ./custom/contexts \
  --agents-path ./custom/agents \
  --hooks-path ./custom/hooks
```

---

## Next Steps

1. **Start a new feature**: `/sdd-requirements my-feature`
2. **Review existing code**: `/sdd-review src/`
3. **Run security audit**: `/sdd-security-check`
4. **Generate tests**: `/sdd-test-gen src/utils.ts`

For more information, see the [README.md](../README.md) or [ARCHITECTURE.md](../ARCHITECTURE.md).

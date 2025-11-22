# AI Agent Spec-Driven Development

Kiro-style Spec Driven Development implementation using MCP tools.

## Project Context

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`
- Commands: `.ai agent/commands/`

### Steering vs Specification

**Steering** (`.kiro/steering/`) - Guide AI with project-wide rules and context  
**Specs** (`.kiro/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `.kiro/specs/` for active specifications
- Use `sdd-status` to check progress

**Current Specifications:**
- `mcp-sdd-server`: MCP server for spec-driven development across AI-agent CLIs and IDEs
- `mcp-steering-fix`: Fix MCP server steering document generation functionality

## Development Guidelines
- Think in English, generate responses in English

## Workflow

### Phase 0: Steering (Optional)
`sdd-steering` - Create/update steering documents  
`sdd-steering-custom` - Create custom steering for specialized contexts

Note: Optional for new features or small additions. You can proceed directly to sdd-init.

### Phase 1: Specification Creation
1. `sdd-init` - Initialize spec with detailed project description
2. `sdd-requirements` - Generate requirements document
3. `sdd-design` - Interactive: "Have you reviewed requirements.md? [y/N]"
4. `sdd-tasks` - Interactive: Confirms both requirements and design review

### Phase 2: Progress Tracking
`sdd-status` - Check current progress and phases

## Development Rules
1. **Consider steering**: Run `sdd-steering` before major development (optional for new features)
2. **Follow 3-phase approval workflow**: Requirements → Design → Tasks → Implementation
3. **Approval required**: Each phase requires human review (interactive prompt or manual)
4. **No skipping phases**: Design requires approved requirements; Tasks require approved design
5. **Update task status**: Mark tasks as completed when working on them
6. **Keep steering current**: Run `sdd-steering` after significant changes
7. **Check spec compliance**: Use `sdd-status` to verify alignment

## Steering Configuration

### Current Steering Files
Managed by `sdd-steering` tool. Updates here reflect tool changes.

### Active Steering Files
- `product.md`: Always included - Product context and business objectives
- `tech.md`: Always included - Technology stack and architectural decisions
- `structure.md`: Always included - File organization and code patterns
- `linus-review.md`: Always included - Ensuring code quality of the projects
- `commit.md`: Always included - Ensuring the commit / merge request / pull request title and message context
- `security-check.md`: Always included - OWASP Top 10 security checklist (REQUIRED for code generation and review)
- `tdd-guideline.md`: Always included - Test-Driven Development workflow (REQUIRED for all new features)
- `principles.md`: Always included - Core coding principles (SOLID, DRY, KISS, YAGNI, Separation of Concerns, Modularity)

### Custom Steering Files
<!-- Added by sdd-steering-custom tool -->
<!-- Format: 
- `filename.md`: Mode - Pattern(s) - Description
  Mode: Always|Conditional|Manual
  Pattern: File patterns for Conditional mode
-->

### Inclusion Modes
- **Always**: Loaded in every interaction (default)
- **Conditional**: Loaded for specific file patterns (e.g., "*.test.js")
- **Manual**: Reference with `@filename.md` syntax

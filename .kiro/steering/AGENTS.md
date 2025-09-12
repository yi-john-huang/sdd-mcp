# AI Agents Integration Guide

## Purpose
This document defines how AI agents should interact with the SDD workflow and provides guidelines for effective agent collaboration in spec-driven development.

## Agent Types and Roles

### Development Agents
AI agents that assist with code implementation, testing, and documentation.

**Primary Tools**: Claude Code, Cursor, GitHub Copilot, and similar AI development assistants.

**Responsibilities**:
- Follow SDD workflow phases strictly
- Generate code based on approved specifications
- Maintain consistency with project steering documents
- Ensure quality through automated testing

### Review Agents
AI agents specialized in code review, quality analysis, and security validation.

**Primary Focus**:
- Apply Linus-style code review principles
- Validate implementation against requirements
- Check for security vulnerabilities
- Ensure performance standards

### Planning Agents
AI agents that help with requirements gathering, design decisions, and task breakdown.

**Primary Activities**:
- Analyze project requirements using EARS format
- Generate technical design documents
- Create implementation task breakdowns
- Validate workflow phase transitions

## Agent Communication Protocol

### Context Sharing
All agents must:
1. Load project steering documents at interaction start
2. Check current workflow phase before proceeding
3. Validate approvals before phase transitions
4. Update spec.json with progress tracking

### Information Flow
```
User Request → Agent Analysis → SDD Tool Invocation → Result Validation → User Response
```

### State Management
- Agents must maintain awareness of current project state
- Phase transitions require explicit approval tracking
- All changes must be logged in spec.json metadata

## Agent Tool Usage

### Required Tools for All Agents
- `sdd-status`: Check current workflow state
- `sdd-context-load`: Load project context
- `sdd-quality-check`: Validate code quality

### Phase-Specific Tools

**Initialization Phase**:
- `sdd-init`: Create new project structure
- `sdd-steering`: Generate steering documents

**Requirements Phase**:
- `sdd-requirements`: Generate requirements document
- `sdd-validate-gap`: Analyze implementation gaps

**Design Phase**:
- `sdd-design`: Create technical design
- `sdd-validate-design`: Review design quality

**Tasks Phase**:
- `sdd-tasks`: Generate task breakdown
- `sdd-spec-impl`: Execute tasks with TDD

**Implementation Phase**:
- `sdd-implement`: Get implementation guidelines
- `sdd-quality-check`: Continuous quality validation

## Agent Collaboration Patterns

### Sequential Collaboration
Agents work in sequence through workflow phases:
```
Planning Agent → Design Agent → Implementation Agent → Review Agent
```

### Parallel Collaboration
Multiple agents work on different aspects simultaneously:
- Frontend Agent handles UI tasks
- Backend Agent handles API tasks
- Test Agent creates test suites
- Documentation Agent updates docs

### Feedback Loops
Agents provide feedback to improve specifications:
- Implementation issues feed back to design
- Test failures inform requirement updates
- Performance problems trigger architecture reviews

## Quality Standards for Agents

### Code Generation Standards
- Follow project coding conventions from structure.md
- Implement comprehensive error handling
- Include appropriate logging and monitoring
- Write self-documenting code with clear naming

### Testing Requirements
- Generate unit tests for all new functions
- Create integration tests for workflows
- Implement performance benchmarks
- Ensure test coverage meets project standards

### Documentation Expectations
- Update relevant documentation with changes
- Maintain clear commit messages following commit.md
- Document design decisions and trade-offs
- Keep README and API docs current

## Agent Configuration

### Environment Setup
Agents should configure their environment with:
```bash
# Load SDD MCP server
npx sdd-mcp-server

# Initialize project context
sdd-context-load [feature-name]

# Check current status
sdd-status [feature-name]
```

### Steering Document Loading
Agents must respect steering document modes:
- **Always**: Load for every interaction
- **Conditional**: Load based on file patterns
- **Manual**: Load when explicitly requested

### Tool Invocation Patterns
```javascript
// Check phase before proceeding
const status = await sdd-status(featureName);

// Validate requirements exist
if (!status.requirements.generated) {
  await sdd-requirements(featureName);
}

// Proceed with implementation
await sdd-implement(featureName);
```

## Best Practices for AI Agents

### 1. Context Awareness
- Always load full project context before making changes
- Understand the current workflow phase and requirements
- Check for existing implementations before creating new ones

### 2. Incremental Progress
- Complete one task fully before moving to the next
- Update task checkboxes in tasks.md as work progresses
- Commit changes frequently with clear messages

### 3. Quality Focus
- Run quality checks after each significant change
- Address issues immediately rather than accumulating debt
- Follow TDD principles: Red → Green → Refactor

### 4. Communication Clarity
- Provide clear explanations for design decisions
- Document assumptions and constraints
- Report blockers and issues promptly

### 5. Workflow Compliance
- Never skip workflow phases
- Ensure approvals are in place before proceeding
- Maintain traceability from requirements to implementation

## Error Handling for Agents

### Common Issues and Solutions

**Phase Violation**: Attempting to skip workflow phases
- Solution: Follow the prescribed phase sequence
- Use `sdd-status` to check current phase

**Missing Context**: Operating without project understanding
- Solution: Load context with `sdd-context-load`
- Review steering documents before proceeding

**Quality Failures**: Code doesn't meet standards
- Solution: Run `sdd-quality-check` regularly
- Apply Linus-style review principles

**Integration Conflicts**: Changes break existing functionality
- Solution: Run comprehensive tests before committing
- Ensure backward compatibility

## Performance Guidelines

### Efficiency Standards
- Minimize redundant tool invocations
- Cache project context when possible
- Batch related operations together

### Resource Management
- Clean up temporary files after operations
- Limit concurrent file operations
- Optimize for large codebases

## Security Considerations

### Code Review Security
- Check for credential exposure
- Validate input sanitization
- Review authentication/authorization logic
- Identify potential injection vulnerabilities

### Data Handling
- Never commit sensitive data
- Use environment variables for configuration
- Implement proper encryption for sensitive operations
- Follow least privilege principles

## Integration with CI/CD

### Automated Workflows
Agents should support CI/CD integration:
- Trigger quality checks on commits
- Validate phase requirements in pipelines
- Generate reports for review processes
- Update documentation automatically

### Deployment Readiness
Before deployment, agents must ensure:
- All tests pass successfully
- Documentation is complete and current
- Quality standards are met
- Security scans show no critical issues

## Continuous Improvement

### Learning from Feedback
- Analyze failed implementations
- Update patterns based on successes
- Refine task estimation accuracy
- Improve requirement interpretation

### Metrics and Monitoring
Track agent performance metrics:
- Task completion accuracy
- Code quality scores
- Time to implementation
- Defect rates post-deployment

## Conclusion

AI agents are integral to the SDD workflow, providing automation and intelligence throughout the development lifecycle. By following these guidelines, agents can effectively collaborate to deliver high-quality, specification-compliant software while maintaining the rigor and discipline of spec-driven development.

Remember: Agents augment human decision-making but don't replace it. Critical decisions, approvals, and architectural choices should always involve human oversight.
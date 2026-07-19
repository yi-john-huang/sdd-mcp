# Design decisions with headings long enough to exercise section boundaries

## Resolver boundary

Canonicalize the workspace, spec root, feature directory, context directory, and each existing artifact. Refuse any real path outside its expected ancestor.

## Selection boundary

Normalize headings and candidate lines once, deduplicate globally, cap each line and section, then allocate the optional budget across approved phase documents.

## Persistence boundary

Treat the canonical compact handoff as a rebuildable cache. Publish durable workflow state first and report pending regeneration if cache publication fails afterward.

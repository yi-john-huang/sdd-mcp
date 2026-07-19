# Requirements for a deliberately large deterministic feature

## Durable workflow authority and contained path resolution

- When a feature is loaded after restart, the service shall reconstruct workflow state from disk without a process-local identifier.
- When a feature is loaded after restart, the service shall reconstruct workflow state from disk without a process-local identifier.
- If any resolved document escapes through a symbolic link, the service shall reject the operation before reading content.
- While selecting compact content, the service shall reserve room for state, next action, and source references.

## Stable cache behavior and bounded output

- When unchanged content is loaded with its fingerprint, the service shall return a not-modified envelope without content.
- When the requested compact budget is below the mandatory envelope, the service shall return the request-specific minimum.
- When full raw content exceeds its budget, the service shall fail rather than silently truncate the source.

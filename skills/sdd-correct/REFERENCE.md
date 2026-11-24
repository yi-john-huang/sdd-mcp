# Correction Reference

Read only when the log format or a tier example is needed.

## Log Format

`.spec/corrections.md` is a plain list, newest last. It lives outside `.spec/steering/` and `.spec/specs/`, so no context loader reads it.

```md
## Agent claimed tests passed without running them
- First seen: 2026-11-02
- Count: 2
- Root cause: the report template had no place for skipped checks.
- Fix: tier 1 — the engine runs the verify command at COMPLETE.
- Rule proposal: none
```

Match entries by symptom, not by wording: "said tests passed but did not run them" and "reported green without a run" are the same entry.

## Tier Examples

1. **Structure**: the agent recorded GREEN after a setup-error RED. Fix: the engine rejects GREEN while the RED classification is `setup`.
2. **Lint, type, or CI**: the agent kept adding `any`. Fix: strict TypeScript and a lint ratchet in CI.
3. **Test**: the agent removed a Skill line that a host depends on. Fix: a canonical-asset regex for that line.
4. **Rule or Skill text**: the agent asked the same clarifying question in every phase, twice. No gate can express "ask once", so add one Skill sentence after approval.

## Deleting Obsolete Text

When a tier 1–3 fix makes a sentence unnecessary, quote the sentence, name the file, and say which check now enforces it. Delete it only after explicit approval.

---
name: sdd-correct
description: Define the strongest durable correction for a repeated agent failure, preferring structure over rule text.
disable-model-invocation: true
---

# Correction

Work inline in the current turn. Never split work to justify agents and do not offer project agents.

## Method

1. Restate the failure as an observable symptom and its root cause.
2. Read `.spec/corrections.md` (create it if missing). Find an entry with the same symptom; increment its count, or append a dated entry with count 1. If the log cannot be written, report a blocker and change no rule.
3. Pick the strongest feasible tier, in this order:
   1. **Structure**: types, data shape, or an engine or runtime gate that makes the failure impossible.
   2. **Lint, type, or CI**: a check that fails the build.
   3. **Test or verification command**: a test that fails when the failure recurs.
   4. **Rule or Skill text**: wording an agent reads.
4. Use tier 4 only when the entry's count is at least 2 (the second occurrence), or when the failure is irreversible or security-relevant.
5. Implement tiers 1–3 through the `simple-task` loop: a failing test first, then the smallest fix.
6. List rule or Skill lines that the fix makes obsolete, and propose their deletion.
7. Get explicit approval in the current turn before adding or deleting any rule or Skill text. Without it, record the proposal in the log entry and stop.

The log is never loaded into feature context; read it only in this Skill.

## Output

Report the symptom, root cause, log entry and count, chosen tier and why stronger tiers were not feasible, changed paths with test evidence, proposed rule additions or deletions awaiting approval, `Unverified / Could Not Run`, and blockers. Execution report: mode (inline|project-agent; asked|reused|not offered), agents started and whether parallel, configured model/effort per agent (never claim unobserved values), and any fallback to the parent.

## Optional Reference

Read [REFERENCE.md](REFERENCE.md) only for log format or examples of each tier.

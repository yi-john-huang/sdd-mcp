# Skill Blind-Test Kit

Use this kit before a structural Skill edit merges: a change to a Skill's method, gates, stop rules, or output contract. Wording-only edits do not need it. Paste the result table into the pull request.

Each fixture in `fixtures/` sets a trap that the Skill must handle:

| Fixture | Skill | Trap |
|---|---|---|
| `sdd-implement-setup-red.json` | `sdd-implement` | The first RED fails on a missing module, not an assertion. |
| `simple-task-unverifiable.json` | `simple-task` | A requested check cannot run in the environment. |
| `sdd-correct-repeat.json` | `sdd-correct` | A failure recurs, and the easy fix is more rule text. |
| `sdd-requirements-delegated-gate.json` | `sdd-requirements` | Delegated mode is on, the user asks for self-approval, and the only review sidecar is stale. |

A fixture has four fields: `skill`, `prompt`, `setup`, and `checklist` (at least three items, each observable in a transcript). `src/__tests__/unit/cli/skill-evals.test.ts` checks the format.

## Run

1. Build two installs in separate temporary projects: one from the base branch (`A`) and one from the change (`B`). Install the same host target in both.
2. For each fixture, prepare the project as `setup` describes.
3. Start a fresh host session in each project, invoke the Skill, and send `prompt` exactly. Do not add hints.
4. Save each full transcript as `<fixture>-<run-id>.md`, where `run-id` is a random label, not `A` or `B`. Keep the label-to-variant key in a separate file.
5. Run each fixture at least twice per variant; agent behavior varies between runs.

## Blinding

- A second person, or a fresh model session that has not seen the change, grades the transcripts.
- The grader gets only the fixture's `checklist` and the transcripts with random labels. They do not get the diff, the branch names, or the key.
- For each checklist item, the grader marks `pass`, `fail`, or `unclear`, and quotes the transcript line that decides it.
- Unblind only after every transcript is graded.

## Result Template

```md
### Skill blind-test results

Change: <one line>
Runs per variant: <n>

| Fixture | Item | Base pass rate | Change pass rate |
|---|---|---|---|
| sdd-implement-setup-red | re-recorded RED before GREEN | 1/2 | 2/2 |

Regressions: <items where the change scored lower, or None>
Unclear grades: <count and items, or None>
```

A change that lowers any item's pass rate needs a reason in the pull request, or a fix before it merges.

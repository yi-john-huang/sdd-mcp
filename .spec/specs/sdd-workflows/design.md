# Design: sdd-workflows

## Overview

Add one user/profile-scoped setup command for the existing SDD runtime and manual Skills. Extend the current installer rather than introducing a second installer, configuration format, workflow engine, or service. Preserve project-install defaults and explicit workflow approval gates.

Inputs are the approved [requirements](requirements.md), the unchanged [source plan](plan.md), and project steering already reviewed in .spec/steering/product.md, tech.md, and structure.md. Only this design artifact and its governed metadata are changed in the design phase.

## Requirements Traceability

| Requirement | Design decisions | Acceptance evidence |
|---|---|---|
| FR-1: command and target selection | D-1 | Invalid argv produces no writes; default/selected hosts; compiled dispatch |
| FR-2: runtime before native Skills | D-1, D-4, D-5 | Runtime failure prevents that host's Skill writes; native rendered output |
| FR-3: Claude user locations | D-2, D-3 | Default and overridden config/Skills/state paths |
| FR-4: Codex user locations | D-2, D-3 | CODEX_HOME changes runtime only |
| FR-5: OMP discovery | D-2 | No-shell command and single absolute result |
| FR-6: OMP fallback | D-2 | Defined-empty profile precedence; named/default directories; unsafe profiles |
| FR-7: ownership separation | D-3, D-4 | Independent manifests/locks/backups; no runtime in files-only pass |
| FR-8: preservation and reporting | D-1, D-4, D-5 | Unrelated bytes/comments, conflicts, partial-target failures |
| FR-9: reruns and upgrades | D-3, D-4, D-5 | Exact-version upgrade; duplicate-free rerun; concurrent invocation |
| FR-10: project-root binding | D-6 | Stdio sdd-init and project-sensitive reads use selected project |
| FR-11: bootstrap delivery | D-7 | Real wrapper argument forwarding and packed executable |
| FR-12: documentation | D-8 | User instructions, precise scopes, host checks, release note |
| NFR-1: least privilege and paths | D-2, D-3, D-5 | Zero Claude permission mutations; rejected symlink/escape destinations |
| NFR-2: bounded work | D-1, D-2, D-9 | One/three targets; zero repo scans; zero/one OMP discovery |
| NFR-3: compatibility and verification | D-3, D-4, D-6, D-7, D-9 | Existing project journeys and isolated packed-package smoke |

## Architecture and Data Flow

### Pattern and boundaries

Retain the repository's layered/hexagonal arrangement. This feature is mostly a CLI adapter enhancement, not a new domain model. CLI orchestration owns target selection, user locations, and reporting; existing filesystem adapters own preservation and commits; the MCP adapter supplies one workspace root to existing application services. No new DI service, transport, database, background daemon, or public MCP tool is required.

~~~text
bootstrap.sh or direct npx
        |
sdd-entry.js -> compiled CLI -> GlobalSetupCLI
                                 |
                         parse all argv first
                                 |
                         resolve selected host
                                 |
                  runtime writer lock (held to end)
                                 |
               register runtime + runtime manifest
                                 |
                      Skills writer lock
                                 |
                TargetInstallSession.copySkills
                                 |
                  files-only Skills manifest
                                 |
                      report -> next host

host starts pinned stdio runtime
        |
SDDToolAdapter workspace resolver
        |
existing workflow / context / steering / analysis / template services
        |
active project .spec and project files (not user setup state)
~~~

### Data ownership and lifecycle

- Package-owned source assets remain in skills/. Installed copies are target-rendered outputs; global setup never edits canonical assets.
- Native user configuration files remain user-owned. The installer owns only the sdd-mcp entry or marked Codex region, using the existing semantic/region ownership rules.
- Each selected host has two ownership stores: runtime and Skills. Each uses the existing install-manifest.json schema, install.lock lease, and backups layout under its configured state directory.
- Runtime state records one registration and no newly copied Skill files. Skills state records copied files and normally an empty registrations array. A files-only pass preserves an existing registrations array rather than erasing it.
- Workflow specifications still belong only to the active project's .spec directory. Global setup creates no .spec, root guidance, .gitignore, or repository integration files.
- Successful reruns converge to one entry and one managed copy of each packaged file. Manifest metadata can be rewritten; byte-for-byte manifest identity is not an idempotence requirement.

### Transaction and concurrency boundary

Process selected hosts sequentially in a stable order: claude-code, codex, omp. Independent host failures are accumulated, not fail-fast. There is no benefit in parallelizing three small local installs inside the CLI.

For each host, acquire its runtime writer lock and retain it while registering runtime and performing the nested Skills pass. Acquire locks only in runtime-then-Skills order. This prevents two versions of setup-global from interleaving runtime A, runtime B, Skills B, Skills A. The existing withInstallLock re-entrant path allows installRuntimeRegistration to run under that same writer's active lease.

The two manifests are separate commit points, not a distributed transaction. After runtime commits, a Skills error does not remove or roll back that runtime. Report the partial result with nonzero status; a later explicit rerun repairs unmodified managed assets. Runtime registration failure skips that host's Skills entirely. No automatic retry or compensation across hosts is introduced.

Existing compare-before-write checks, atomic file replacement, lease assertions, ownership verification, and conditional rollback remain authoritative. They protect against detected concurrent edits; they do not make arbitrary writes by an unrelated host process part of the install lock protocol. Do not claim a cross-process filesystem transaction stronger than the existing writer provides.

## Components and Interfaces

### D-1: Small global setup orchestrator and strict command boundary
**Covers:** FR-1, FR-2, FR-8, NFR-2
**Decision:** Add GlobalSetupCLI in src/cli/setup-global.ts and dispatch setup-global through both existing entrypoints, using existing target types, a typed global report that separates runtime ownership conflicts from failures, and one small injected environment/command boundary.
**Failure behavior:** Invalid argv throws CliUsageError before directory creation or command execution; per-host results keep successful/skipped assets, preserved conflicts, and failures in distinct report collections and do not suppress later hosts. Overall exit status is 1 for any failure or preserved conflict and 0 otherwise.
**Verification:** Exercise argv rejection without filesystem effects, target isolation, default three-host setup, and compiled command reachability.

**Type:** CLI adapter/orchestrator. Owns selection and per-invocation reports; owns no durable workflow data.

Proposed contracts (signatures, not implementation stubs):

~~~typescript
interface GlobalSetupOptions {
  target?: InstallTarget;
}
interface GlobalSetupDependencies {
  env: NodeJS.ProcessEnv;
  homedir(): string;
  runOmpConfigPath(): Promise<string>;
}
type RuntimeConflictReason =
  | 'unmanaged-entry'
  | 'modified-entry'
  | 'unowned-region';
interface RuntimeInstallConflict {
  component: 'runtime';
  name: 'sdd-mcp';
  path: string;
  reason: RuntimeConflictReason;
}
interface GlobalTargetReport extends Omit<TargetInstallReport, 'conflicts'> {
  conflicts: Array<InstallConflict | RuntimeInstallConflict>;
}
interface GlobalSetupCLIContract {
  parseArgs(args: string[]): GlobalSetupOptions;
  run(options: GlobalSetupOptions): Promise<GlobalTargetReport[]>;
}
// Export from setup-global.ts:
// class GlobalSetupCLI implements GlobalSetupCLIContract
// constructor(dependencies?: Partial<GlobalSetupDependencies>)
// mainGlobalSetup(args?: string[]): Promise<void>
~~~

Production defaults are process.env, os.homedir, and child_process.execFile('omp', ['config', 'path']) with shell disabled. Tests replace home/environment lookup and that runner; filesystem writes still exercise the real writer in temporary roots. Instantiate SkillManager from resolvePackageComponentPath('skills') after argv parsing; global setup needs no RulesManager, ContextManager, AgentManager, or HookLoader.

Only the approved syntax setup-global [--target <claude-code|codex|omp>] is supported. Reject positional arguments, unknown switches, missing values, repeated target flags even when identical, and unsupported values. Do not inherit legacy target prompts, --all-tools, refresh flags, target path flags, or project compatibility fallback. Top-level CLI help documents the new command without changing existing commands.

mainGlobalSetup accepts argv supplied by the dispatcher, prints grouped host results, and sets process.exitCode from returned reports after all hosts finish. Avoid process.exit inside the host loop. Print separate Installed/Unchanged, Preserved conflicts, and Failures groups per target. Runtime ownership conflicts and Skill conflicts both populate conflicts; malformed configuration, unsafe paths, I/O, and commit errors populate failed. Both collections contribute independently to exit status 1. Classification uses the typed runtime error below, never message matching. Diagnostics contain target, stage, exact path, and a concise reason; never dump configuration contents.

### D-2: Explicit native user-location resolver
**Covers:** FR-3, FR-4, FR-5, FR-6, NFR-1, NFR-2
**Decision:** Resolve a small installation-location record per selected target in setup-global.ts, keeping runtime writer roots separate from Skills writer roots and never deriving installation paths from the active repository.
**Failure behavior:** Unsafe environment paths or destinations fail that target before its asset writes. Invalid/unavailable OMP discovery enters the documented fallback once; invalid fallback input fails OMP rather than silently selecting another profile.
**Verification:** Temporary-home path matrix, single-line OMP output, profile precedence, tilde handling, control-character/traversal/symlink rejection, and no OMP call when unselected.

**Type:** Path resolver within the CLI adapter; no separate service hierarchy.

~~~typescript
interface GlobalTargetLocations {
  target: InstallTarget;
  runtimeRoot: string;
  runtimeConfig: string;        // writer-root-relative
  runtimeStateDirectory: string; // writer-root-relative
  skillsRoot: string;
  skillsDirectory: string;       // writer-root-relative
  skillsStateDirectory: string;  // writer-root-relative
  fallbackNotice?: string;
}
~~~

Let H be the canonical home, P the Claude personal directory, C the Codex home, and A the OMP active-agent directory. All displayed subpaths are literal relative paths, not shell expressions.

| Target | Runtime writer root | Runtime config | Runtime state directory | Skills writer root | Skills directory | Skills state directory |
|---|---|---|---|---|---|---|
| Claude default | H | .claude.json | .claude/.sdd-mcp/global-runtime | H/.claude | skills | .sdd-mcp/global-skills |
| Claude override | P | .claude.json | .sdd-mcp/global-runtime | P | skills | .sdd-mcp/global-skills |
| Codex | C | config.toml | .sdd-mcp/global-runtime | H/.agents | skills | .sdd-mcp/global-skills |
| OMP | A | mcp.json | .sdd-mcp/global-runtime | A | skills | .sdd-mcp/global-skills |

Claude: P is non-empty CLAUDE_CONFIG_DIR or H/.claude. The presence of a non-empty override selects the override row even if its resolved value equals H/.claude. Do not move default ~/.claude.json into ~/.claude merely to simplify roots.

Codex: C is non-empty CODEX_HOME or H/.codex. Skills remain at H/.agents/skills regardless of CODEX_HOME.

OMP discovery: execute once only when selected. Remove the terminating line ending from stdout; accept exactly one non-empty absolute path with no embedded control characters or extra output lines. Do not parse logs, JSON, quoted paths, or multiple candidates heuristically. Command failure, unavailable executable, or invalid output selects fallback and emits the resolved fallback location. An accepted discovery path still undergoes destination safety checks; an unsafe discovered destination is a target failure, not permission to choose a different directory.

OMP fallback:

1. Read OMP_PROFILE when defined, otherwise PI_PROFILE. Normalize surrounding whitespace for profile selection; empty, whitespace-only, and default select the default profile.
2. Reject control characters in the supplied profile before normalization, except that an entirely whitespace value selects the explicitly approved default case. Reject slash, backslash, and traversal names . or .. in a named profile.
3. For default profile use non-empty PI_CODING_AGENT_DIR when supplied; otherwise use H/<config-dir>/agent.
4. For named profile use H/<config-dir>/profiles/<profile>/agent and ignore PI_CODING_AGENT_DIR.
5. config-dir is non-empty PI_CONFIG_DIR or .omp and is a home-relative directory. Reject absolute or escaping values; do not allow an environment override to turn this child path into a new arbitrary root.

Path normalization is not shell expansion. Expand only ~ and ~/..., preserve spaces within valid paths, reject control characters, and require explicit directory overrides to become absolute rather than resolving them relative to cwd. Canonicalize existing ancestors without creating files. Validate every managed/config/state destination against its selected root before creating directories and again at writer mutation boundaries. Use the existing validateDestinationPath checks to reject escapes and symlink traversal beneath roots; do not resolve a managed symlink target and then adopt it as owned content. No installation path falls back to cwd.

User-home/config overrides are explicit user-scope inputs, not project discovery inputs. Do not enumerate repositories or migrate their entries. Verification runs with distinct user roots and project directories and asserts no repository writes.

### D-3: Configurable ownership directories without a manifest fork
**Covers:** FR-3, FR-4, FR-7, FR-9, NFR-1, NFR-3
**Decision:** Extend PreservingWriter with an optional stateDirectory and use it consistently for the existing lock, manifest, and backups; keep the existing schema and the default .sdd-mcp location.
**Failure behavior:** State paths outside the writer root, unsafe symlinks, invalid manifests, or detected concurrent manifest edits fail without claiming ownership or overwriting unknown bytes.
**Verification:** Separate runtime/Skills manifests survive reruns; locks and backups reside under the selected state directory; existing project writer tests keep their default behavior.

**Type:** Existing filesystem/ownership adapter in src/cli/utils/preserving-writer.ts.

~~~typescript
interface PreservingWriterOptions {
  stateDirectory?: string;
}
// constructor(projectRoot: string, options?: PreservingWriterOptions)
~~~

Resolve stateDirectory once against the writer root; default to .sdd-mcp. Require a non-empty contained descendant, not the root itself. Derive these paths from that one resolved state root:

- install.lock
- install-manifest.json
- backups/<existing-timestamp>/<target>/<writer-root-relative-file>

Do not change how managed file paths are relative to the writer root: they are not relative to stateDirectory. The Claude default runtime writer is rooted at H precisely so both .claude.json and .claude/.sdd-mcp/global-runtime fit containment.

**Persistent model:** retain InstallManifest with schemaVersion, targets, and shared; each target retains profile, packageVersion, rendererVersion, files, and registrations. Files map relative path to SHA-256 and component. Registrations retain path, serverName, entrySemanticSha256, optional managedRegionSha256, and existing optional permission fields. At most one registration per target; zero is valid for a Skills-only namespace. Keep current legacy-schema normalization; no schema migration or new version is necessary.

A new global namespace does not import a project manifest. Existing unowned global content is adopted only according to the current exact-content/ownership rules. No inference of ownership from filenames, package name, or a matching version alone.

### D-4: Files-only sessions with preserved project defaults
**Covers:** FR-2, FR-7, FR-8, FR-9, NFR-3
**Decision:** Add a default-enabled runtime-registration flag to the writer/session boundary and run global Skills through TargetInstallSession.copySkills directly, not through adapters that emit root guidance.
**Failure behavior:** Files-only failures use existing managed-file rollback and report a Skills/state path; they never fabricate a runtime path or dereference omitted paths. Previously committed runtime remains installed and partial success is reported.
**Verification:** Files-only session writes rendered Skills without a runtime config, preserves prior registration records, and cannot remove unrelated root guidance; existing project adapters still register and verify runtime by default.

**Type:** Existing installation session in src/cli/tool-support/target-installer.ts and writer transaction logic.

~~~typescript
// New final parameters preserve existing callers:
// PreservingWriter.beginTarget(
//   target, profile, components, refreshGenerated = false,
//   registerRuntime = true
// ): void
// TargetInstallSession constructor(
//   target, projectRoot, writer, profile, components,
//   refreshGenerated = false, registerRuntime = true
// )
// TargetInstallSession.complete(
//   paths?: ResolvedInstallPaths
// ): Promise<TargetInstallReport>
~~~

The writer records the flag per target; beginTarget resets stale per-target runtime paths/results when reused. Keep root in selected components for the existing project path. For files-only sessions select only the supplied components so obsolete-root pruning cannot occur in a Skills-only operation.

In commitTargetLocked, create a runtime registration result only when registration is enabled. Condition runtime verify/rollback and runtime report contribution on that result. When absent, persist previousTarget.registrations or an empty array. Keep generated-file verification, conditional rollback, manifest compare-and-swap, preserved-modified tracking, and commit-after-write-error handling unchanged. Do not replace these guarantees with a simple copy operation.

complete(paths?) checks the session flag: registration-enabled requires paths and invokes requireRuntimeRegistration; files-only requires neither paths nor runtime operations. Missing required paths produce a controlled installation failure. Its catch path uses the known runtime config when enabled and available, otherwise the Skills writer/state location, without accessing paths.runtimeConfig unconditionally.

Global orchestration uses profile lean, components ['skills'], refreshGenerated false, and registerRuntime false. Hold skillsWriter.withInstallLock around session creation, copySkills, and complete so mutations occur under the existing lease. Capture report.failed and report.conflicts even when complete resolves normally; resolution is not success.

Keep renderTargetSkill and generated Codex agents/openai.yaml policy unchanged. Copy supporting reference files under each Skill. Manual invocation and role/model metadata remain those of the existing renderer. Global setup does not install custom agents: Codex's existing unavailable-agent fallback and OMP's explicit project-advisor opt-in remain meaningful, not promises that global agents were installed.

### D-5: Exact-version registration with an explicit Claude permission opt-out
**Covers:** FR-2, FR-8, FR-9, NFR-1
**Decision:** Reuse registerRuntimeLocked for native JSONC/TOML edits and append a configureClaudePermissions option defaulting to true; global setup passes false.
**Failure behavior:** Malformed config, duplicate/ambiguous properties or markers, ownership conflicts, detected concurrent edits, and failed runtime commits are preserved and reported at the exact config/state path. Skip that host's Skills after any registration failure.
**Verification:** Global Claude settings files stay absent or byte-identical, including malformed existing settings; unrelated JSONC/TOML bytes/comments survive; upgrades and duplicate-free reruns use PACKAGE_VERSION.

**Type:** Existing native runtime configuration adapter in src/cli/tool-support/mcp-registration.ts.

~~~typescript
interface RuntimeRegistrationOptions {
  configureClaudePermissions?: boolean;
}
// registerRuntimeLocked(
//   projectRoot, target, paths, previous?, assertHeld?,
//   options?: RuntimeRegistrationOptions
// ): Promise<RuntimeRegistrationResult>
// PreservingWriter.installRuntimeRegistration(
//   target, paths?, options?: RuntimeRegistrationOptions
// ): Promise<{ installed: string[]; skipped: string[]; warnings: string[] }>
~~~

Thread the option through the runtime-only writer call; project callsites omit it and keep current permissions. For Claude with the option false, do not resolve, read, parse, create, write, verify, or roll back a permission file. A malformed settings.json must not block global registration because permissions are outside this operation. Newly written global runtime records omit permissionPath and permissionSemanticSha256. Existing permission files and allow entries are not removed either.

Create runtime paths from the existing target policy with only runtimeConfig replaced by the resolved relative config path; runtimePermissionConfig is irrelevant to the global call because permission configuration is disabled. Other policy paths remain unused; this is not an invitation to invoke the project adapter.

Native entry contracts remain exactly those of the existing registration code:

- Claude/OMP: mcpServers.sdd-mcp with type stdio, command npx, args ['-y', 'sdd-mcp-server@<PACKAGE_VERSION>'].
- Codex: the existing marked [mcp_servers.'sdd-mcp'] block, including command/args, required = true, default_tools_approval_mode = 'auto', and startup_timeout_sec = 30. Claude's permission non-mutation rule is not a new Codex policy change.

JSONC editing changes only the owned entry and required delimiters/formatting. Preserve unrelated comments and value bytes. Codex replaces only its exact owned marked region; even an equivalent unmarked same-name entry remains a conflict under current behavior. Do not add aliases, adopt customized regions, or replace whole config documents.

Define an exported RuntimeRegistrationConflictError in mcp-registration.ts, extending Error with readonly configPath: string and readonly reason: RuntimeConflictReason. Define/export RuntimeConflictReason beside this error; setup-global.ts imports that type and owns RuntimeInstallConflict and GlobalTargetReport. This preserves dependency direction. The error identifies an ownership refusal, not malformed input or an operational failure. Pass the resolved absolute config path into the JSONC/TOML ownership checks so the typed error is created at the decision point, not inferred from a message later.

Classify known ownership cases explicitly:

| Ownership condition | Typed reason | Global report collection |
|---|---|---|
| Same-name JSONC entry is neither desired nor previously owned | modified-entry when a prior ownership record exists, otherwise unmanaged-entry | conflicts |
| Codex same-name entry lacks managed markers, including an exact unmarked entry | unmanaged-entry | conflicts |
| Previously owned Codex region or semantic entry differs from the recorded hashes | modified-entry | conflicts |
| Complete unowned Codex region differs from desired bytes/semantics | unowned-region | conflicts |

Malformed JSONC/TOML, duplicate properties, partial/multiple marker structures, invalid manifests, unsafe paths, I/O errors, lease loss, and detected concurrent edits during a commit remain failures. They do not become ownership conflicts merely because bytes were preserved.

The global orchestration catch checks instanceof RuntimeRegistrationConflictError and appends a RuntimeInstallConflict to GlobalTargetReport.conflicts. All other errors append an InstallFailure to failed with the actual config/state path. In either case it skips that target's Skills and continues independent targets. Existing project installers can continue catching the Error subclass through their existing failure path; their public report contract is unchanged. No persisted manifest schema change is needed.

RuntimeRegistrationOptions remains independent of this classification. The low-level registration function still throws on an unsuccessful registration; the typed error carries enough evidence for global presentation without parsing diagnostic strings.

### D-6: One runtime workspace-root resolver
**Covers:** FR-10, NFR-3
**Decision:** Add one private root resolver in SDDToolAdapter and route every project-sensitive handler/helper through it, choosing non-empty CLAUDE_PROJECT_DIR before process.cwd().
**Failure behavior:** Invalid/inaccessible project roots use existing application/path-resolution errors; never silently fall back to a config directory after a supplied project root fails.
**Verification:** Real stdio calls from a distinct config working directory create and read feature state under CLAUDE_PROJECT_DIR; absent/empty variable retains cwd behavior; steering/package analysis reads the selected project's data.

**Type:** Existing MCP adapter. Signature: private resolveWorkspaceRoot(): string. Normalize the selected path using path.resolve. Non-empty means a defined string of nonzero length, not a hostname or target heuristic; an empty value selects cwd. Do not call process.chdir or mutate the environment.

Resolve at an operation boundary and pass the root consistently into its service calls. Migrate initialization/clarification, status/list, feature loading, artifact submission, approvals/review, implementation/progress, context, steering/custom steering, gap analysis, template feature loading, and project package/directory inspection. Helpers that accept a root use that argument rather than independently selecting a different directory midway through the same operation.

Pure code quality analysis needs no filesystem root. Template assets and package-owned resources still resolve from the installed package, not from the user's repository. Do not change the MCP tool schemas, workflow authority, approval semantics, or manifest schema.

### D-7: Thin bootstrap and shared package component discovery
**Covers:** FR-11, NFR-3
**Decision:** Add an executable POSIX bootstrap.sh that delegates to npx and extract InstallSkillsCLI's private component lookup into the existing find-package-root utility for both CLIs.
**Failure behavior:** Missing npx fails clearly; delegated exit status is preserved; missing packaged Skills fail setup rather than substituting empty successful output.
**Verification:** A fake npx records exact argument boundaries and exit status; npm pack contains executable bootstrap.sh and real package assets; the packed CLI installs rendered Skills.

**Types:** Shell wrapper and existing package-location utility. New exported utility signature: resolvePackageComponentPath(componentDir: string): string in src/cli/utils/find-package-root.ts.

Move getDefaultPath's lookup order and debug behavior into that helper, using existing getDistCliDir. Migrate all six InstallSkillsCLI component paths and delete the obsolete private method; global setup reuses only the Skills lookup. Resolve packaged sources from the running package before existing development fallbacks. No duplicate path-search code or new dependency is needed.

Wrapper contract:

~~~sh
#!/bin/sh
if ! command -v npx >/dev/null 2>&1; then
  printf '%s\n' 'sdd-mcp setup requires npx (Node.js/npm).' >&2
  exit 1
fi
exec npx -y "${SDD_MCP_PACKAGE:-sdd-mcp-server@latest}" setup-global "$@"
~~~

The package spec is one quoted argument; pass original arguments unchanged. SDD_MCP_PACKAGE is an explicit caller-selected package execution input, not an untrusted value to interpolate into a shell command. Include bootstrap.sh in package.json files and preserve executable mode. Do not add a lifecycle install script, sudo step, global npm install, or automatic repository follow-up.

The direct npx command is the cross-platform public entrypoint. POSIX sh is only needed for the wrapper. If omp is not directly executable without a shell on a platform, discovery failure uses the documented fallback; do not enable a shell just to run a command shim.

### D-8: User-facing scope, verification, and rollout documentation
**Covers:** FR-12
**Decision:** Update existing README.md, docs/INSTALL-GUIDE.md, docs/WORKFLOW.md, and CHANGELOG.md during implementation, using the location table and host-native checks rather than introducing a separate setup guide.
**Failure behavior:** Instructions distinguish registration from live connectivity and explain policy/trust, missing host/npx, preserved conflicts, and project shadowing without recommending forced overwrite or blanket Claude permission grants.
**Verification:** Review documented commands and files against the packed smoke result and host checks; keep behavior-oriented documentation consistency checks without pinning incidental prose.

Lead with one-time bootstrap for checkout users and npx -y sdd-mcp-server@latest setup-global for users without a checkout/POSIX shell. Include --target examples and SDD_MCP_PACKAGE pinning, version-aligned reruns, per-profile OMP setup, reload/trust steps, and the optional team/project installer.

Show claude mcp get sdd-mcp, codex mcp get sdd-mcp, and OMP /mcp test sdd-mcp from a directory without a project entry. Clarify that setup writes configuration and Skills but does not itself prove a host session connected. Document CLI project/local precedence over user runtime entries, not a universal claim about Skill precedence or every desktop product. Current Claude docs describe a Desktop Code-tab runtime precedence exception and personal-over-project Skill precedence; global setup does not override host precedence rules.

Local personal Skills are not automatically available in Claude cloud/Cowork sessions. Global setup neither scans repositories nor removes shadowing project entries. Users remove only the relevant project sdd-mcp definition when they deliberately choose global scope; unrelated server entries and project assets remain untouched.

### D-9: Bounded, isolated verification and compatibility
**Covers:** NFR-2, NFR-3
**Decision:** Keep the existing Node.js >=18 ESM/Jest toolchain and add focused boundary coverage plus a real packed-package smoke, using temporary environment roots rather than the developer's home.
**Failure behavior:** Any contract failure blocks implementation acceptance. Tests do not call installed hosts against real user config, auto-approve workflow phases, or modify live user permissions.
**Verification:** Execute the Verification section after implementation; count one/three targets and zero/one OMP discovery calls, and compare seeded user/project bytes before and after.

Work scales with selected host count (bounded by three), packaged Skill files, and the selected config/manifest sizes. There is no repository enumeration, telemetry, polling, or extra workflow background process. Package download/network latency is outside the CLI's wall-clock contract. Do not add caching or concurrency machinery for this bounded workload.

## Failure Handling

| Failure stage | Observable result | Persistence and recovery |
|---|---|---|
| Invalid argv | Usage diagnostic, exit 1 | No command discovery or installation writes |
| Invalid user path/profile | Target and path/setting diagnostic, exit 1 overall | No writes to the invalid destination; other hosts continue |
| OMP discovery unavailable/invalid | Explicit fallback notice | One fallback calculation, no command retry |
| Runtime ownership refusal | Preserved conflicts group with exact config path and typed ownership reason | Config retained; that host's Skills skipped; exit 1 overall |
| Malformed runtime config or invalid structure | Failures group with exact config path and validation reason | Config retained; that host's Skills skipped; exit 1 overall |
| Runtime lock/manifest/config write error | Path-bearing runtime failure | Existing conditional rollback; unknown/concurrently changed bytes preserved |
| Modified or unowned Skill | Existing conflict record and path | User file retained; independent files/hosts proceed; exit 1 |
| Skill read/write/finalization failure | Failed Skills/state path; partial target reported | Existing managed rollback for uncommitted writes; committed runtime retained |
| Commit completed but lock release/write acknowledgement failed | Existing warning plus accurate installed state | Do not roll back bytes proven committed; present warning |
| Manifest changed to unknown bytes | Explicit preservation failure | Preserve partials rather than overwriting another writer |
| Missing npx | Wrapper diagnostic, nonzero exit | No setup process launched |
| Host not connected/trusted | Documented host diagnostic | Setup never broadens policy to bypass it |

Avoid claiming all-or-nothing installation. Session copy operations already collect per-file failures; other valid files can commit. Aggregate reports must distinguish attempted writes, committed assets, skipped identical files, preserved conflicts, and failures; do not count rolled-back attempts as successful installation. Preserve project-install report structures. GlobalTargetReport extends only the orchestration conflict collection so runtime ownership refusals cannot be counted or printed as failures. Normalizing attempted-versus-committed presentation does not change conflict classification.

No new retry policy: users resolve conflicts and rerun explicitly. Existing lock acquisition behavior remains unchanged. Stop using a lease after its ownership assertion fails; unknown user bytes win over automated recovery.

## Security Considerations

- **Authentication:** no new credentials or authentication mechanism. The local OS user and host's existing trust/permission policy authorize setup and subsequent MCP calls.
- **Authorization:** global setup touches only resolved user/profile assets and their ownership namespaces. It does not install root guidance, change Claude settings, or grant global tool allow rules.
- **Path boundary:** environment/profile values and omp stdout are validated before writes. Containment and symlink rejection cover managed files and ownership stores; package source names reuse validateChildName.
- **Injection boundary:** OMP discovery uses an argument array without a shell. The POSIX wrapper quotes its package spec and argument vector. No eval, command-string composition, or environment dump is needed.
- **Data protection:** config files can contain unrelated secrets; diagnostics show paths/reasons only. Preserve unrelated fields/comments and do not log full documents or copy them into workflow artifacts.
- **Residual risk:** the existing path checks and compare-before-write protocol are not an OS sandbox against a hostile same-user process swapping paths at arbitrary instants. This feature reuses their guarantees and does not claim to solve that broader filesystem threat model.

## Compatibility, Dependencies, and Rollout

**Internal dependencies:** PreservingWriter, TargetInstallSession/renderTargetSkill, getTargetPolicy/InstallTarget/TargetInstallReport/CliUsageError, SkillManager, find-package-root utilities, PACKAGE_VERSION, existing filesystem leases and atomic writers, and SDDToolAdapter's current application services.

**External dependencies:** existing Node.js fs/path/os/child_process APIs, jsonc-parser, smol-toml, write-file-atomic, MCP SDK, and Jest tooling. No dependency additions. npx is required by the public wrapper/runtime contract; installed host CLIs are needed for manual host verification, not for copying user assets. OMP discovery has a fallback.

**Source changes planned:** src/cli/setup-global.ts; src/cli/sdd-mcp-cli.ts; sdd-entry.js; src/cli/utils/preserving-writer.ts; src/cli/tool-support/target-installer.ts; src/cli/tool-support/mcp-registration.ts; src/cli/utils/find-package-root.ts; src/cli/install-skills.ts; src/adapters/cli/SDDToolAdapter.ts; bootstrap.sh; package.json; the four existing user documentation files; focused tests listed below. Generated host trees are not edited by hand.

**Callsite compatibility:** existing Claude/Codex/OMP project adapters construct the session without the new final argument, so runtime registration stays enabled. The writer's existing root-only constructor still selects .sdd-mcp. Existing low-level registration calls retain permission defaults. Replace the private package lookup and every caller, not a deprecated alias. The workspace-root change intentionally affects project operations whenever CLAUDE_PROJECT_DIR is non-empty.

**Rollout:** ship setup-global in the normal package. Initial setup starts fresh global ownership namespaces; reruns upgrade only owned, unmodified assets. Do not migrate or delete project installs. Exact package pinning is the rollback selection mechanism for a user-driven rerun; user edits continue to conflict safely. No automatic downgrade, uninstall, alias, or legacy compatibility command is added.

**Trade-offs and quality review:** one CLI class and a location record keep control flow inspectable. Reusing session rendering avoids divergent Skills. Separate namespaces cost two manifests per host but avoid mixing ownership lifecycles. Holding a runtime lock across its Skills pass prevents version interleaving without a new global lock service. Retaining committed runtime after Skills failure sacrifices cross-store atomicity in favor of the source plan's preserve-first, recoverable sequencing. Existing project defaults stay intact.

## Verification

### Focused behavioral coverage

| Boundary | File(s) | Observable assertions |
|---|---|---|
| Selection and user paths | new src/__tests__/unit/cli/setup-global.test.ts | No-write invalid argv; each target; default three; override matrix; forbidden project artifacts absent |
| OMP discovery/fallback | setup-global.test.ts | Argument-array runner, one absolute line, failure/invalid output, profile precedence, default override, unsafe inputs |
| Native Skill contract | setup-global.test.ts and existing installer coverage | Manual invocation and target model policy; Codex openai.yaml; supporting references; no global agents/root guidance |
| Namespace/files-only ownership | preserving-writer.test.ts and session coverage | Correct locks/manifests/backups; previous registrations retained; default project behavior; file rollback and unknown-byte preservation |
| Runtime policy/config | mcp-registration.test.ts and setup-global.test.ts | No permission reads/writes globally; unrelated JSONC/TOML content; exact-version upgrade; typed ownership refusals versus malformed/I/O failures |
| Rerun/concurrency/failure | setup-global.test.ts and writer tests | One entry per host, modified files retained, independent hosts complete, two invocations cannot leave a successful mixed-version pair; real ownership conflict appears only under Preserved conflicts while malformed/I/O errors appear only under Failures |
| Wrapper/package | new bootstrap.test.ts | Exact argv with spaces/metacharacters; default/override spec; missing npx; propagated status; packed file mode/inclusion |
| Workspace root | runtime/entrypoints.stdio.test.ts | Actual stdio init/status/context against distinct cwd/project; unset/empty fallback; no config-root .spec |
| Entrypoints/project regression | compiled-cli.e2e.test.ts, governed-workflow.e2e.test.ts | setup-global reachable and existing project installs/workflows preserved |
| User instructions | documentation-consistency.test.ts plus review | Commands/paths match behavior; no assertions that merely pin prose wording |

Use permanent tests for plausible boundary failures, not forwarding-only or source-text assertions. Test actual filesystem outcomes and exit codes; do not mock writer success. Avoid a new project-wide suite or coverage target; retain the repository's existing standards.

### Implementation acceptance commands

After implementation, run the focused tests from plan.md, compile, then run compiled journeys. entrypoints.stdio.test.ts exercises dist, so run the build before executing that runtime test when validating changed source; do not rely on stale dist.

~~~sh
npm run build
npm test -- --runInBand --runTestsByPath src/__tests__/unit/cli/setup-global.test.ts src/__tests__/unit/cli/bootstrap.test.ts src/__tests__/unit/cli/mcp-registration.test.ts src/__tests__/unit/cli/preserving-writer.test.ts src/__tests__/unit/runtime/entrypoints.stdio.test.ts src/__tests__/unit/cli/documentation-consistency.test.ts
npm test -- --runInBand --runTestsByPath src/__tests__/unit/cli/compiled-cli.e2e.test.ts src/__tests__/unit/cli/governed-workflow.e2e.test.ts
~~~

Retain the existing compiled suite's build convention unless its own change is necessary; these commands describe acceptance, not test execution during this design phase.

### Real packed-package smoke

1. Build and npm pack into a temporary directory. Inspect the tarball for executable bootstrap.sh and packaged Skills; create a separate temporary project and empty user/config roots.
2. Seed unrelated JSONC/TOML comments and values. Seed a Claude settings.json fixture and preserve its bytes, plus verify the absent-settings case separately.
3. Run the real wrapper using the packed tarball in SDD_MCP_PACKAGE and isolated HOME, CLAUDE_CONFIG_DIR, CODEX_HOME, PI_CODING_AGENT_DIR, OMP_PROFILE, and PI_PROFILE as specified in plan.md. Ensure the test environment's omp discovery is either a controlled executable returning the isolated agent directory or deliberately unavailable. Environment overrides alone are not enough if a real installed omp returns a different directory.
4. Expect exit 0; three rendered sdd-requirements/SKILL.md files; exactly pinned registrations; unrelated seeded bytes retained; no Claude permission change; no project installation assets. Rerun and require exit 0 with no duplicate registrations/files.
5. Modify one Skill and one host's runtime registration in separate scenarios. Rerun; expect preservation, exact-path diagnostics under Preserved conflicts rather than Failures, nonzero exit, and successful independent hosts. In separate malformed-config and injected I/O scenarios, expect the Failures group rather than Preserved conflicts. Exercise an owned old-version fixture with a newer package to prove upgrade ownership.
6. Launch the packed stdio runtime from a config directory with CLAUDE_PROJECT_DIR pointing at the distinct temporary project. Call sdd-init with a sufficiently specified goal/clarification answers for global-root-smoke. Assert only the project receives .spec/specs/global-root-smoke/spec.json; status/context resolve the same feature. Unset/empty environment cases target cwd.
7. When supported host CLIs are available, check registrations from an isolated non-shadowing directory using the documented host commands. Report unavailable host verification distinctly from the filesystem/package smoke; never claim live host connectivity from file existence alone.
8. Remove temporary package roots and smoke scripts after evidence is captured. Do not remove user/project configuration.

### Design-phase evidence and human gate

The design-phase checks are approved-requirements status, source and upstream contract inspection, deterministic design submission/validation, and persisted unapproved design status. Global setup is not implemented or smoke-tested in this phase. Request explicit human approval before generating tasks or implementing this design.

## Upstream References and Contract Confidence

Reviewed during design:

- [Claude Code MCP](https://code.claude.com/docs/en/mcp): user ~/.claude.json, stdio CLAUDE_PROJECT_DIR, runtime scope precedence and host checks.
- [Claude Code Skills](https://code.claude.com/docs/en/skills): local personal Skills, manual invocation, and Cowork/cloud limitations.
- [Claude environment variables](https://code.claude.com/docs/en/env-vars): CLAUDE_CONFIG_DIR override.
- [Codex MCP](https://developers.openai.com/codex/mcp/) and [advanced configuration](https://developers.openai.com/codex/config-advanced/): native TOML, CODEX_HOME, project override behavior.
- [Codex Skills](https://developers.openai.com/codex/skills): ~/.agents/skills and explicit-only policy metadata. The upstream URL currently redirects to the shared ChatGPT/Codex documentation.
- [OMP MCP configuration](https://github.com/can1357/oh-my-pi/blob/main/docs/mcp-config.md), [Skills](https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md), and [configuration discovery](https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md): active profile roots, native Skills, env precedence, default agent directory, and project runtime priority.

The approved Claude override path <CLAUDE_CONFIG_DIR>/.claude.json remains the design contract. The reviewed high-level Claude documentation confirms the config-directory override and default ~/.claude.json separately but does not explicitly specify their combined path; the isolated host check must verify this combination before release. A host-version discrepancy requires an explicit requirements/design revision, not a silent path substitution.

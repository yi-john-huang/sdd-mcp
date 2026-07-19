#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InstallSkillsCLI } from '../dist/cli/install-skills.js';

export const V351_OMP_BASELINE_LABEL = 'v3.5.1 OMP compatibility baseline (Codex AGENTS.md + .agents/skills metadata; .codex/agents excluded)';
export const V351_CLAUDE_BASELINE_LABEL = 'v3.5.1 Claude Code full baseline';

export const PROVIDER_ADAPTERS = Object.freeze({
  anthropic: Object.freeze({ inputIncludesCacheRead: false, inputIncludesCacheWrite: false, outputIncludesReasoning: true }),
  openai: Object.freeze({ inputIncludesCacheRead: true, inputIncludesCacheWrite: false, outputIncludesReasoning: true }),
  'openai-codex': Object.freeze({ inputIncludesCacheRead: true, inputIncludesCacheWrite: false, outputIncludesReasoning: true }),
});

function bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

async function filesBelow(root) {
  const found = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) found.push(absolute);
    }
  }
  await visit(root);
  return found;
}

function frontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return { metadata: '', body: content };
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { metadata: '', body: content };
  return { metadata: `${match[1]}\n`, body: content.slice(match[0].length) };
}

function emptyCategory() {
  return { bytes: 0, files: 0 };
}

function categoryFor(relative) {
  const normalized = relative.replaceAll(path.sep, '/');
  if (/(?:^|\/)skills\/[^/]+\/SKILL\.md$/.test(normalized)) return 'coreSkillBodies';
  if (/(?:^|\/)skills\/[^/]+\/(?:REFERENCE\.md|references\/)/.test(normalized)) return 'references';
  if (/(?:^|\/)agents\//.test(normalized)) return 'agentBodies';
  if (/(?:^|\/)rules\//.test(normalized)) return 'rules';
  if (/(?:^|\/)contexts\//.test(normalized)) return 'contexts';
  if (/(?:^|\/)steering\//.test(normalized)) return 'steering';
  if (/(?:^|\/)hooks\//.test(normalized)) return 'hooks';
  return 'other';
}

function hostRules(target, relative, content) {
  const normalized = relative.replaceAll(path.sep, '/');
  const parsed = frontmatter(content);
  const metadataBytes = bytes(parsed.metadata);
  if (target === 'claude-code' && normalized.startsWith('.claude/rules/')) {
    const scoped = /^paths\s*:/m.test(parsed.metadata);
    return scoped
      ? { metadata: metadataBytes, unconditional: 0 }
      : { metadata: 0, unconditional: bytes(content) };
  }
  if (target === 'omp' && normalized.startsWith('.omp/rules/')) {
    const always = /^alwaysApply\s*:\s*true\s*$/m.test(parsed.metadata);
    return always
      ? { metadata: 0, unconditional: bytes(content) }
      : { metadata: metadataBytes, unconditional: 0 };
  }
  return { metadata: 0, unconditional: 0 };
}

function isRootGuidance(target, relative) {
  if (target === 'claude-code') return relative === 'CLAUDE.md';
  if (target === 'omp') return relative === '.omp/AGENTS.md';
  return relative === 'AGENTS.md';
}

function isSkill(target, relative) {
  const normalized = relative.replaceAll(path.sep, '/');
  if (target === 'claude-code') return /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(normalized);
  if (target === 'omp') return /^\.omp\/skills\/[^/]+\/SKILL\.md$/.test(normalized);
  return /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(normalized);
}

function skillIndexBytes(target, content) {
  const metadata = frontmatter(content).metadata;
  if ((target === 'omp' || target === 'claude-code') && /^disable-model-invocation\s*:\s*true\s*$/m.test(metadata)) {
    return 0;
  }
  const visibleFields = metadata
    .split(/\r?\n/)
    .filter(line => /^(?:name|description)\s*:/.test(line))
    .join('\n');
  return visibleFields ? bytes(`${visibleFields}\n`) : 0;
}

export async function collectStaticTree(root, options) {
  const absoluteRoot = path.resolve(root);
  const target = options.target;
  const categories = Object.fromEntries(['coreSkillBodies', 'references', 'agentBodies', 'rules', 'contexts', 'steering', 'hooks', 'other'].map(name => [name, emptyCategory()]));
  const hostVisible = {
    rootGuidanceBytes: 0,
    skillIndexBytes: 0,
    rulebookMetadataBytes: 0,
    unconditionalRuleBytes: 0,
    totalBytes: 0,
  };
  let installedBytes = 0;
  let installedFiles = 0;

  for (const absolute of await filesBelow(absoluteRoot)) {
    const relative = path.relative(absoluteRoot, absolute).replaceAll(path.sep, '/');
    const content = await readFile(absolute, 'utf8');
    const fileBytes = bytes(content);
    installedBytes += fileBytes;
    installedFiles += 1;
    const category = categories[categoryFor(relative)];
    category.bytes += fileBytes;
    category.files += 1;
    if (isRootGuidance(target, relative)) hostVisible.rootGuidanceBytes += fileBytes;
    if (isSkill(target, relative)) hostVisible.skillIndexBytes += skillIndexBytes(target, content);
    const rule = hostRules(target, relative, content);
    hostVisible.rulebookMetadataBytes += rule.metadata;
    hostVisible.unconditionalRuleBytes += rule.unconditional;
  }

  hostVisible.totalBytes = hostVisible.rootGuidanceBytes
    + hostVisible.skillIndexBytes
    + hostVisible.rulebookMetadataBytes
    + hostVisible.unconditionalRuleBytes;
  const baseline = target === 'omp-v3.5.1-baseline';
  return {
    label: baseline ? V351_OMP_BASELINE_LABEL : `${target} ${options.profile}`,
    target,
    profile: options.profile,
    installedBytes,
    installedFiles,
    hostVisible,
    nonHostLoadedInstalledBytes: Math.max(0, installedBytes - hostVisible.totalBytes),
    categories,
    notes: baseline
      ? ['.codex/agents is installed but excluded because OMP does not discover Codex agent TOML']
      : [],
  };
}

const V351_OMP_BASELINE = Object.freeze({
  label: V351_OMP_BASELINE_LABEL,
  target: 'omp-v3.5.1-baseline',
  profile: 'full',
  installedBytes: 140625,
  installedFiles: 35,
  hostVisible: Object.freeze({
    rootGuidanceBytes: 5491,
    skillIndexBytes: 2526,
    rulebookMetadataBytes: 0,
    unconditionalRuleBytes: 0,
    totalBytes: 8017,
  }),
  nonHostLoadedInstalledBytes: 132608,
  categories: Object.freeze({
    coreSkillBodies: Object.freeze({ bytes: 75358, files: 11 }),
    references: Object.freeze({ bytes: 0, files: 0 }),
    agentBodies: Object.freeze({ bytes: 26332, files: 6 }),
    rules: Object.freeze({ bytes: 16055, files: 6 }),
    contexts: Object.freeze({ bytes: 9914, files: 5 }),
    steering: Object.freeze({ bytes: 4522, files: 3 }),
    hooks: Object.freeze({ bytes: 2336, files: 1 }),
    other: Object.freeze({ bytes: 6108, files: 3 }),
  }),
  notes: Object.freeze([
    'Measured from the v3.5.1 release installer output; retained as an immutable release baseline.',
    '.codex/agents is installed but excluded because OMP does not discover Codex agent TOML',
  ]),
});

const V351_CLAUDE_BASELINE = Object.freeze({
  label: V351_CLAUDE_BASELINE_LABEL,
  target: 'claude-code-v3.5.1-baseline',
  profile: 'full',
  installedBytes: 148037,
  installedFiles: 40,
  hostVisible: Object.freeze({
    rootGuidanceBytes: 6616,
    skillIndexBytes: 2526,
    rulebookMetadataBytes: 0,
    unconditionalRuleBytes: 16055,
    totalBytes: 25197,
  }),
  nonHostLoadedInstalledBytes: 122840,
  categories: Object.freeze({
    coreSkillBodies: Object.freeze({ bytes: 75358, files: 11 }),
    references: Object.freeze({ bytes: 0, files: 0 }),
    agentBodies: Object.freeze({ bytes: 26332, files: 6 }),
    rules: Object.freeze({ bytes: 16055, files: 6 }),
    contexts: Object.freeze({ bytes: 9914, files: 5 }),
    steering: Object.freeze({ bytes: 4522, files: 3 }),
    hooks: Object.freeze({ bytes: 9981, files: 7 }),
    other: Object.freeze({ bytes: 5875, files: 2 }),
  }),
  notes: Object.freeze([
    'Measured from a fresh v3.5.1 Claude Code full install generated from the release tag.',
    'Host-visible bytes include root guidance, skill metadata, and six unscoped rule bodies.',
  ]),
});

export function collectV351ClaudeBaseline() {
  return V351_CLAUDE_BASELINE;
}

export async function collectV351OmpBaseline() {
  return V351_OMP_BASELINE;
}

function quietPromptIO() {
  return {
    isInteractive: () => false,
    chooseTarget: async () => null,
    writeNotice: () => {},
  };
}

export async function generateFreshStaticTrees() {
  const temporary = await mkdtemp(path.join(tmpdir(), 'sdd-context-static-'));
  const results = [];
  const originalCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  try {
    console.log = () => {};
    console.error = () => {};
    for (const target of ['codex', 'claude-code', 'omp']) {
      for (const profile of ['lean', 'full']) {
        const root = path.join(temporary, target, profile);
        await mkdir(root, { recursive: true });
        process.chdir(root);
        const cli = new InstallSkillsCLI(undefined, undefined, quietPromptIO());
        const options = cli.parseArgs(['--target', target, '--profile', profile]);
        await cli.runUnified(options);
        if (process.exitCode) throw new Error(`Static ${target}/${profile} installation failed`);
        results.push(await collectStaticTree(root, { target, profile }));
      }
    }
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
    console.error = originalError;
    await rm(temporary, { recursive: true, force: true });
  }
  results.unshift(collectV351ClaudeBaseline(), await collectV351OmpBaseline());
  return results;
}

function requireNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return value;
}

function rawZero() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function addRaw(target, usage, label) {
  for (const name of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    target[name] += requireNumber(usage[name], `${label}.usage.${name}`);
  }
  if (!usage.cost || typeof usage.cost !== 'object') throw new Error(`${label}.usage.cost must be an object`);
  for (const name of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) {
    target.cost[name] += requireNumber(usage.cost[name], `${label}.usage.cost.${name}`);
  }
}

function adapterFor(provider) {
  return PROVIDER_ADAPTERS[String(provider).toLowerCase()];
}

function normalizeMessage(message, label) {
  const adapter = adapterFor(message.provider);
  const usage = message.usage;
  if (!adapter) {
    return { inputWorkTokens: 0, outputWorkTokens: 0, totalWorkTokens: 0, verified: false, reason: `No verified usage adapter for ${message.provider || 'missing provider'}` };
  }
  if (!adapter.outputIncludesReasoning) {
    return { inputWorkTokens: 0, outputWorkTokens: 0, totalWorkTokens: 0, verified: false, reason: `${message.provider} output normalization does not include reasoning` };
  }
  const input = requireNumber(usage.input, `${label}.usage.input`)
    + (adapter.inputIncludesCacheRead ? 0 : requireNumber(usage.cacheRead, `${label}.usage.cacheRead`))
    + (adapter.inputIncludesCacheWrite ? 0 : requireNumber(usage.cacheWrite, `${label}.usage.cacheWrite`));
  const output = requireNumber(usage.output, `${label}.usage.output`);
  return { inputWorkTokens: input, outputWorkTokens: output, totalWorkTokens: input + output, verified: true };
}

async function parseSessionFile(file) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) throw new Error(`${path.basename(file)}: empty JSONL session`);
  const entries = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${path.basename(file)}:${index + 1}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const headerIndex = entries.findIndex(entry => entry?.type === 'session');
  const header = headerIndex >= 0 ? entries[headerIndex] : undefined;
  if (!header || typeof header.id !== 'string') {
    throw new Error(`${path.basename(file)}: invalid session header`);
  }
  const containingDirectory = path.dirname(file);
  const possibleParentFile = path.join(
    path.dirname(containingDirectory),
    `${path.basename(containingDirectory)}.jsonl`
  );
  let nestedOmpSpecialist = false;
  try {
    nestedOmpSpecialist = (await stat(possibleParentFile)).isFile();
  } catch {
    nestedOmpSpecialist = false;
  }
  const raw = rawZero();
  const normalized = { inputWorkTokens: 0, outputWorkTokens: 0, totalWorkTokens: 0, verified: true };
  const normalizationErrors = [];
  const providerModels = new Set();
  let usageMessages = 0;
  entries.forEach((entry, index) => {
    if (entry.type !== 'message' || !entry.message || entry.message.usage === undefined) return;
    const label = `${path.basename(file)}:${index + 1}`;
    addRaw(raw, entry.message.usage, label);
    usageMessages += 1;
    const provider = typeof entry.message.provider === 'string' ? entry.message.provider : 'unknown';
    const model = typeof entry.message.model === 'string' ? entry.message.model : 'unknown';
    providerModels.add(`${provider}/${model}`);
    const value = normalizeMessage(entry.message, label);
    normalized.inputWorkTokens += value.inputWorkTokens;
    normalized.outputWorkTokens += value.outputWorkTokens;
    normalized.totalWorkTokens += value.totalWorkTokens;
    if (!value.verified) {
      normalized.verified = false;
      normalizationErrors.push(value.reason);
    }
  });
  return {
    sessionId: header.id,
    parentSession: typeof header.parentSession === 'string' ? header.parentSession : undefined,
    kind: header.parentSession || nestedOmpSpecialist ? 'specialist' : 'parent',
    usageMessages,
    providerModels: [...providerModels].sort(),
    raw,
    normalized,
    normalizationErrors: [...new Set(normalizationErrors)].sort(),
  };
}

export async function parseSessionRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) throw new Error('At least one explicit session JSONL root is required');
  const sessionFiles = new Set();
  for (const supplied of roots) {
    const absolute = path.resolve(supplied);
    const info = await stat(absolute);
    if (info.isFile()) {
      if (!absolute.endsWith('.jsonl')) throw new Error(`${supplied} is not a JSONL file`);
      sessionFiles.add(absolute);
    } else if (info.isDirectory()) {
      for (const file of await filesBelow(absolute)) if (file.endsWith('.jsonl')) sessionFiles.add(file);
    } else throw new Error(`${supplied} is neither a file nor a directory`);
  }
  if (sessionFiles.size === 0) throw new Error('No JSONL session files found beneath the supplied roots');
  const sessions = [];
  for (const file of [...sessionFiles].sort()) sessions.push(await parseSessionFile(file));
  sessions.sort((left, right) => left.kind.localeCompare(right.kind) || left.sessionId.localeCompare(right.sessionId));
  const raw = rawZero();
  const normalized = { inputWorkTokens: 0, outputWorkTokens: 0, totalWorkTokens: 0, verified: true };
  const normalizationErrors = [];
  const providerModels = new Set();
  let peakInputWorkTokens = 0;
  for (const session of sessions) {
    addRaw(raw, { ...session.raw, cost: session.raw.cost }, `session ${session.sessionId}`);
    normalized.inputWorkTokens += session.normalized.inputWorkTokens;
    normalized.outputWorkTokens += session.normalized.outputWorkTokens;
    normalized.totalWorkTokens += session.normalized.totalWorkTokens;
    normalized.verified &&= session.normalized.verified;
    normalizationErrors.push(...session.normalizationErrors);
    session.providerModels.forEach(value => providerModels.add(value));
    peakInputWorkTokens = Math.max(peakInputWorkTokens, session.normalized.inputWorkTokens);
  }
  return {
    sessionCount: sessions.length,
    specialistCount: sessions.filter(session => session.kind === 'specialist').length,
    sessions,
    raw,
    normalized,
    peakInputWorkTokens,
    providerModels: [...providerModels].sort(),
    normalizationErrors: [...new Set(normalizationErrors)].sort(),
  };
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function compareUsage(before, after) {
  if (!before || !after) return { valid: false, reason: 'Both before and after usage are required for comparison' };
  const sameProviderModels = sameStrings(before.providerModels, after.providerModels);
  const positiveCost = before.raw.cost.total > 0 && after.raw.cost.total > 0;
  if (positiveCost && sameProviderModels) {
    return {
      valid: true,
      metric: 'cost',
      before: before.raw.cost.total,
      after: after.raw.cost.total,
      changePercentage: ((after.raw.cost.total - before.raw.cost.total) / before.raw.cost.total) * 100,
    };
  }
  if (before.normalized.verified && after.normalized.verified && before.normalized.totalWorkTokens > 0) {
    return {
      valid: true,
      metric: 'normalizedTotalWorkTokens',
      before: before.normalized.totalWorkTokens,
      after: after.normalized.totalWorkTokens,
      changePercentage: ((after.normalized.totalWorkTokens - before.normalized.totalWorkTokens) / before.normalized.totalWorkTokens) * 100,
      costFallbackReason: positiveCost ? 'Positive costs are not comparable across different provider/model sets' : 'Comparable positive cost is unavailable',
    };
  }
  return {
    valid: false,
    reason: `Comparable positive cost is unavailable and verified total-token normalization is unavailable${[...before.normalizationErrors, ...after.normalizationErrors].length ? `: ${[...new Set([...before.normalizationErrors, ...after.normalizationErrors])].join('; ')}` : ''}`,
  };
}

const STATIC_REDUCTION_CONTRACTS = Object.freeze({
  codex: Object.freeze({ baseline: V351_OMP_BASELINE, minimumReductionPercentage: 50 }),
  omp: Object.freeze({ baseline: V351_OMP_BASELINE, minimumReductionPercentage: 50 }),
  'claude-code': Object.freeze({ baseline: V351_CLAUDE_BASELINE, minimumReductionPercentage: 60 }),
});

export function calculateStaticReductions(staticTrees) {
  return Object.entries(STATIC_REDUCTION_CONTRACTS).map(([target, contract]) => {
    const current = staticTrees.find(tree => tree.target === target && tree.profile === 'full');
    if (!current) {
      return {
        target,
        valid: false,
        reason: `Missing fresh ${target} full tree`,
        minimumReductionPercentage: contract.minimumReductionPercentage,
      };
    }
    const baselineHostVisibleBytes = contract.baseline.hostVisible.totalBytes;
    const currentHostVisibleBytes = current.hostVisible.totalBytes;
    const reductionPercentage = ((baselineHostVisibleBytes - currentHostVisibleBytes) / baselineHostVisibleBytes) * 100;
    return {
      target,
      valid: true,
      baselineLabel: contract.baseline.label,
      baselineHostVisibleBytes,
      currentHostVisibleBytes,
      reductionPercentage,
      minimumReductionPercentage: contract.minimumReductionPercentage,
      passes: reductionPercentage >= contract.minimumReductionPercentage,
    };
  });
}

export function createReport({ staticTrees = [], before, after } = {}) {
  return {
    schemaVersion: 1,
    measurementModel: {
      repositoryStaticPayload: 'measured exact UTF-8 bytes',
      repositoryDynamicPayload: 'reported as installed core/reference/agent categories; invocation is not inferred',
      observedHostUsage: 'provider-reported aggregate usage only',
      unobservableHostPayload: 'unknown',
      deterministicTokenEstimate: 'ceil(characters / 4), labeled estimatedTokens; not an actual tokenizer count',
      providerUsageNormalization: PROVIDER_ADAPTERS,
    },
    static: staticTrees,
    staticReductions: calculateStaticReductions(staticTrees),
    observed: { before, after, comparison: before && after ? compareUsage(before, after) : undefined },
  };
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, sorted(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

function usageRow(label, usage) {
  return [label, usage.raw.input, usage.raw.output, usage.raw.cacheRead, usage.raw.cacheWrite, usage.raw.cost.total, usage.normalized.inputWorkTokens, usage.normalized.totalWorkTokens, usage.normalized.verified ? 'yes' : 'no'];
}

function usageRows(label, usage) {
  if (!usage) return [];
  return [
    usageRow(`${label}:total`, usage),
    ...usage.sessions.map(session => usageRow(`${label}:${session.kind}:${session.sessionId}`, session)),
  ];
}

function table(headers, rows) {
  if (rows.length === 0) return '(none)';
  const printable = [headers, ...rows].map(row => row.map(String));
  const widths = headers.map((_, column) => Math.max(...printable.map(row => row[column].length)));
  return printable.map((row, index) => {
    const rendered = row.map((cell, column) => cell.padEnd(widths[column])).join(' | ');
    if (index === 0) return `${rendered}\n${widths.map(width => '-'.repeat(width)).join('-|-')}`;
    return rendered;
  }).join('\n');
}

export function renderHumanReport(report) {
  const staticRows = report.static.map(item => [item.label, item.installedBytes, item.hostVisible.totalBytes, item.nonHostLoadedInstalledBytes, item.hostVisible.rootGuidanceBytes, item.hostVisible.skillIndexBytes, item.hostVisible.unconditionalRuleBytes]);
  const reductionRows = report.staticReductions.map(item => item.valid
    ? [item.target, item.baselineHostVisibleBytes, item.currentHostVisibleBytes, item.reductionPercentage.toFixed(2), item.minimumReductionPercentage, item.passes ? 'pass' : 'fail']
    : [item.target, 'n/a', 'n/a', 'n/a', item.minimumReductionPercentage, `invalid: ${item.reason}`]);
  const usage = [...usageRows('before', report.observed.before), ...usageRows('after', report.observed.after)];
  const comparison = report.observed.comparison
    ? report.observed.comparison.valid
      ? `${report.observed.comparison.metric}: ${report.observed.comparison.before} -> ${report.observed.comparison.after} (${report.observed.comparison.changePercentage.toFixed(2)}%)`
      : `invalid: ${report.observed.comparison.reason}`
    : 'not requested';
  return [
    'Repository static payload (exact UTF-8 bytes)',
    table(['tree', 'installed', 'host-visible', 'non-host-loaded', 'root', 'skill-index', 'unconditional-rules'], staticRows),
    'Static host-visible reduction gates',
    table(['target', 'baseline', 'current', 'reduction %', 'required %', 'status'], reductionRows),
    '',
    '',
    'Repository dynamic payload',
    'Installed core skill, reference, context, and specialist-agent bodies are categorized in JSON; invocation is not inferred.',
    '',
    'Observed host usage (provider-reported aggregates)',
    table(['branch/session', 'input', 'output', 'cache-read', 'cache-write', 'cost', 'normalized-input', 'normalized-work', 'verified'], usage),
    `Peak normalized input work: before=${report.observed.before?.peakInputWorkTokens ?? 'n/a'}, after=${report.observed.after?.peakInputWorkTokens ?? 'n/a'}`,
    `Comparison gate: ${comparison}`,
    '',
    'Unobservable host payload',
    'unknown (host system instructions, tool schemas, provider internals, and hidden orchestration are not inferred)',
    '',
  ].join('\n');
}

function parseArguments(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--before' || argument === '--after') {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a path`);
      options[argument.slice(2)] = value;
    } else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

const HELP = `Usage: sdd-mcp-server context-report [--before <session-root>] [--after <session-root>] [--json]\n\nReads only explicitly supplied OMP JSONL roots. Static target trees are generated in temporary directories.\n`;

export async function runCli(argv, io = process) {
  const options = parseArguments(argv);
  if (options.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (options.after && !options.before) throw new Error('--after requires --before');
  const staticTrees = await generateFreshStaticTrees();
  const before = options.before ? await parseSessionRoots([options.before]) : undefined;
  const after = options.after ? await parseSessionRoots([options.after]) : undefined;
  const report = createReport({ staticTrees, before, after });
  io.stdout.write(options.json ? stableJson(report) : renderHumanReport(report));
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`context-report: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

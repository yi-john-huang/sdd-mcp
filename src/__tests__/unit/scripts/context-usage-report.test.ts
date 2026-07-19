import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the packaged ESM reporter in a real Node process so the standard
// Jest run stays compatible with the repository's existing injected globals.
const reporterUrl = pathToFileURL(path.resolve('scripts/context-usage-report.mjs')).href;
const bridge = `
  const request = JSON.parse(process.env.REPORT_REQUEST);
  const reporter = await import(${JSON.stringify(reporterUrl)});
  const target = reporter[request.name];
  const value = typeof target === 'function' ? await target(...request.args) : target;
  process.stdout.write(JSON.stringify(value));
`;

function invokeReporter(name: string, args: unknown[] = []): any {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', bridge], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, REPORT_REQUEST: JSON.stringify({ name, args }) },
  });
  return JSON.parse(output);
}

const V351_CLAUDE_BASELINE_LABEL = invokeReporter('V351_CLAUDE_BASELINE_LABEL') as string;
const V351_OMP_BASELINE_LABEL = invokeReporter('V351_OMP_BASELINE_LABEL') as string;
const calculateStaticReductions = (trees: unknown[]) => invokeReporter('calculateStaticReductions', [trees]);
const collectStaticTree = async (root: string, options: unknown) => invokeReporter('collectStaticTree', [root, options]);
const collectV351ClaudeBaseline = () => invokeReporter('collectV351ClaudeBaseline');
const compareUsage = (before: unknown, after: unknown) => invokeReporter('compareUsage', [before, after]);
const createReport = (options: unknown) => invokeReporter('createReport', [options]);
const parseSessionRoots = async (roots: string[]) => invokeReporter('parseSessionRoots', [roots]);
const renderHumanReport = (report: unknown) => invokeReporter('renderHumanReport', [report]) as string;
const stableJson = (value: unknown) => invokeReporter('stableJson', [value]) as string;

const fixtures = path.resolve('src/__tests__/fixtures/context-usage');

async function put(root: string, relative: string, content: string): Promise<void> {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}

describe('context usage report', () => {
  test('separates installed bytes from exact host-visible categories and labels the v3.5.1 OMP baseline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'usage-static-'));
    await put(root, 'AGENTS.md', 'root\n');
    await put(root, '.agents/skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo.\n---\nbody\n');
    await put(root, '.codex/agents/planner.toml', 'model = "ignored-by-omp"\n');

    const measured = await collectStaticTree(root, {
      target: 'omp-v3.5.1-baseline',
      profile: 'full',
    });

    expect(measured.label).toBe(V351_OMP_BASELINE_LABEL);
    expect(measured.installedBytes).toBe(Buffer.byteLength('root\n---\nname: demo\ndescription: Demo.\n---\nbody\nmodel = "ignored-by-omp"\n'));
    expect(measured.hostVisible.rootGuidanceBytes).toBe(5);
    expect(measured.hostVisible.skillIndexBytes).toBe(Buffer.byteLength('name: demo\ndescription: Demo.\n'));
    expect(measured.hostVisible.unconditionalRuleBytes).toBe(0);
    expect(measured.hostVisible.totalBytes).toBe(5 + measured.hostVisible.skillIndexBytes);
    expect(measured.nonHostLoadedInstalledBytes).toBe(measured.installedBytes - measured.hostVisible.totalBytes);
    expect(measured.notes).toContain('.codex/agents is installed but excluded because OMP does not discover Codex agent TOML');
  });


  test('enforces target-specific v3.5.1 static reduction gates', () => {
    const reductions = calculateStaticReductions([
      { target: 'codex', profile: 'full', hostVisible: { totalBytes: 2074 } },
      { target: 'omp', profile: 'full', hostVisible: { totalBytes: 1355 } },
      { target: 'claude-code', profile: 'full', hostVisible: { totalBytes: 1161 } },
    ]);
    expect(reductions.map(({ target, passes }) => [target, passes])).toEqual([
      ['codex', true],
      ['omp', true],
      ['claude-code', true],
    ]);
    expect(reductions.map(({ reductionPercentage }) => reductionPercentage)).toEqual([
      expect.closeTo(74.13, 2),
      expect.closeTo(83.10, 2),
      expect.closeTo(95.39, 2),
    ]);
    const claudeBaseline = collectV351ClaudeBaseline();
    expect(claudeBaseline.label).toBe(V351_CLAUDE_BASELINE_LABEL);
    expect(claudeBaseline.hostVisible).toEqual({
      rootGuidanceBytes: 6616,
      skillIndexBytes: 2526,
      rulebookMetadataBytes: 0,
      unconditionalRuleBytes: 16055,
      totalBytes: 25197,
    });
  });
  test('counts OMP rulebook metadata separately from on-demand bodies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'usage-omp-'));
    await put(root, '.omp/AGENTS.md', 'omp root');
    await put(root, '.omp/rules/security.md', '---\ndescription: Security\nglobs:\n  - "**/*.ts"\nalwaysApply: false\n---\nsecret body');
    await put(root, '.omp/skills/manual/SKILL.md', '---\nname: manual\ndescription: Hidden from model discovery.\ndisable-model-invocation: true\n---\nmanual body');
    const measured = await collectStaticTree(root, { target: 'omp', profile: 'full' });
    expect(measured.hostVisible.rulebookMetadataBytes).toBeGreaterThan(0);
    expect(measured.hostVisible.skillIndexBytes).toBe(0);
    expect(measured.hostVisible.unconditionalRuleBytes).toBe(0);
    expect(measured.categories.rules.bytes).toBeGreaterThan(measured.hostVisible.rulebookMetadataBytes);
  });

  test('retains raw usage, normalizes adapters without double counting, and includes recursive specialists', async () => {
    const usage = await parseSessionRoots([path.join(fixtures, 'usage/before')]);
    expect(usage.sessions).toHaveLength(2);
    expect(usage.sessions.map((session: { kind: string }) => session.kind)).toEqual(['parent', 'specialist']);
    expect(usage.raw).toMatchObject({ input: 160, output: 37, cacheRead: 60, cacheWrite: 10 });
    // OpenAI input already includes cache reads: 100. Anthropic excludes both cache classes: 60 + 20 + 10.
    expect(usage.normalized).toEqual({ inputWorkTokens: 190, outputWorkTokens: 37, totalWorkTokens: 227, verified: true });
    expect(usage.peakInputWorkTokens).toBe(100);
  });

  test('uses positive comparable cost and otherwise falls back only to verified normalized tokens', async () => {
    const before = await parseSessionRoots([path.join(fixtures, 'usage/before')]);
    const after = await parseSessionRoots([path.join(fixtures, 'usage/after')]);
    expect(compareUsage(before, after)).toMatchObject({
      valid: true,
      metric: 'normalizedTotalWorkTokens',
      costFallbackReason: expect.stringContaining('provider/model'),
    });

    const sameModelBefore = { ...after, raw: { ...after.raw, cost: { ...after.raw.cost, total: 2 } } };
    const sameModelAfter = { ...after, raw: { ...after.raw, cost: { ...after.raw.cost, total: 1 } } };
    expect(compareUsage(sameModelBefore, sameModelAfter)).toMatchObject({ valid: true, metric: 'cost', before: 2, after: 1 });

    const zeroCostBefore = { ...sameModelBefore, raw: { ...sameModelBefore.raw, cost: { ...sameModelBefore.raw.cost, total: 0 } } };
    const zeroCostAfter = { ...sameModelAfter, raw: { ...sameModelAfter.raw, cost: { ...sameModelAfter.raw.cost, total: 0 } } };
    expect(compareUsage(zeroCostBefore, zeroCostAfter)).toMatchObject({ valid: true, metric: 'normalizedTotalWorkTokens' });

    const unverified = await parseSessionRoots([path.join(fixtures, 'usage/unverified')]);
    expect(compareUsage(zeroCostBefore, unverified)).toMatchObject({
      valid: false,
      reason: expect.stringContaining('verified total-token normalization'),
    });
  });

  test('fails rather than silently dropping malformed usage', async () => {
    await expect(parseSessionRoots([path.join(fixtures, 'usage/malformed')])).rejects.toThrow(/broken\.jsonl:2.*usage\.input/);
  });

  test('emits stable aggregate-only JSON and human tables without prompt or response content', async () => {
    const before = await parseSessionRoots([path.join(fixtures, 'usage/before')]);
    const after = await parseSessionRoots([path.join(fixtures, 'usage/after')]);
    const report = createReport({ staticTrees: [], before, after });
    const first = stableJson(report);
    const second = stableJson(createReport({ staticTrees: [], before, after }));
    const human = renderHumanReport(report);
    expect(first).toBe(second);
    expect(first.endsWith('\n')).toBe(true);
    for (const secret of ['PRIVATE PROMPT SENTINEL', 'PRIVATE RESPONSE SENTINEL', 'CHILD PRIVATE RESPONSE', 'AFTER SECRET', '/private/project']) {
      expect(first).not.toContain(secret);
      expect(human).not.toContain(secret);
    }
    expect(human).toContain('Observed host usage');
    expect(human).toContain('Unobservable host payload');
    expect(human).toContain('unknown');
  });

  test('ships deterministic tiny, routine, and large context corpora', async () => {
    const tiny = await collectStaticTree(path.join(fixtures, 'context/tiny'), { target: 'fixture', profile: 'tiny' });
    const routine = await collectStaticTree(path.join(fixtures, 'context/routine'), { target: 'fixture', profile: 'routine' });
    const large = await collectStaticTree(path.join(fixtures, 'context/large'), { target: 'fixture', profile: 'large' });
    expect(tiny.installedBytes).toBeLessThan(routine.installedBytes);
    expect(routine.installedBytes).toBeLessThan(large.installedBytes);
  });
});

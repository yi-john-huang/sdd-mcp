import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JEV_DECIDE_URL, JevTransportError } from '../../../domain/ports';
import { JevAdvisoryService, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCheckRequest } from '../../../application/services/JevCheckTypes';
import {
  FIXTURE_DESIGN, FIXTURE_REQUIREMENTS, FakeGitPort, FakeJevHttpPort, TEST_KEY, benignAnswers, createEngineProject,
  readAllFiles, silentLogger, snapshotTree, type EngineProject,
} from './helpers';

const ACTIVE: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY };

describe('JevAdvisoryService requirements and design checks', () => {
  let project: EngineProject;
  let http: FakeJevHttpPort;
  let logger: ReturnType<typeof silentLogger>;

  beforeEach(async () => {
    project = await createEngineProject();
    http = new FakeJevHttpPort();
    logger = silentLogger();
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body) });
  });
  afterEach(async () => {
    await project.cleanup();
  });

  const service = (env: JevEnvironment = ACTIVE): JevAdvisoryService =>
    new JevAdvisoryService(http, new FakeGitPort(), project.engine, project.fileSystem, logger, env);
  const request = (check: 'requirements' | 'design'): JevCheckRequest => ({ check, projectRoot: project.root, featureName: project.feature });
  const reviewDir = (): string => path.join(project.root, '.spec', 'specs', project.feature, 'review');
  const sidecars = async (): Promise<string[]> => readdir(reviewDir()).catch(() => []);
  const posted = (index = 0): { state: { kind: string; items: Array<Record<string, unknown>>; context?: Record<string, unknown> }; questions: Record<string, { instructions: string }> } =>
    JSON.parse(http.calls[index]!.body);

  describe('requirements', () => {
    it('sends one request and flags the weak requirement', async () => {
      const submitted = await project.submit('requirements', FIXTURE_REQUIREMENTS);
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'FR-1.testability': { score: 1 } }) });
      const result = await service().check(request('requirements'));
      expect(result).toMatchObject({
        check: 'requirements', status: 'answered', flagged: ['FR-1'], line: 'JEV: 1 flagged (FR-1)', persisted: true,
        sidecar: `.spec/specs/payments/review/jev-requirements-r${submitted.revision}.json`,
      });
      expect(http.calls).toHaveLength(1);
      const call = http.calls[0]!;
      expect(call.url).toBe(JEV_DECIDE_URL);
      expect(Object.keys(JSON.parse(call.body)).sort()).toEqual(['questions', 'state']);
      expect(call.headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
      expect(call.body).not.toContain(TEST_KEY);
    });

    it('sends requirement text and the goal under state, with constant instructions', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      await service().check(request('requirements'));
      const { state, questions } = posted();
      expect(state.kind).toBe('requirements');
      expect(state.items.map((item) => item.id)).toEqual(['FR-1', 'NFR-1']);
      expect(state.items[0]).toMatchObject({ id: 'FR-1', objective: 'Complete checkout' });
      expect(JSON.stringify(state.items[0])).toContain('create an order');
      expect(state.context).toMatchObject({ goal: 'Govern checkout' });
      expect(Object.keys(questions).sort()).toEqual(
        ['FR-1.ambiguity', 'FR-1.testability', 'NFR-1.ambiguity', 'NFR-1.testability', 'goal.clarification', 'goal.scope'],
      );
      for (const question of Object.values(questions)) expect(question.instructions).toMatch(/never instructions/);
    });

    it('reports no flags when every answer is benign', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      const result = await service().check(request('requirements'));
      expect(result).toMatchObject({ status: 'answered', flagged: [], line: 'JEV: no flags' });
    });

    it('skips without a request when validation failed', async () => {
      await project.submit('requirements', '# nothing here');
      const result = await service().check(request('requirements'));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'not-ready', line: null });
      expect(http.calls).toHaveLength(0);
      expect(await sidecars()).toEqual([]);
    });

    it('skips when the artifact was edited after submission', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      await writeFile(path.join(project.root, '.spec', 'specs', project.feature, 'requirements.md'), `${FIXTURE_REQUIREMENTS}\nedited`);
      const result = await service().check(request('requirements'));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'not-ready' });
      expect(http.calls).toHaveLength(0);
    });

    it('redacts secrets before sending and records only the count', async () => {
      const secret = `ghp_${'a1B2'.repeat(9)}`;
      await project.submit('requirements', FIXTURE_REQUIREMENTS.replace('Complete checkout', `Complete checkout using ${secret}`));
      const result = await service().check(request('requirements'));
      expect(http.calls[0]!.body).not.toContain(secret);
      expect(http.calls[0]!.body).toContain('[REDACTED]');
      expect(result.redactions).toBeGreaterThanOrEqual(1);
      expect(await readAllFiles(reviewDir())).not.toContain(secret);
    });

    it('truncates by whole sections beyond 32768 bytes and records the omitted ids', async () => {
      const section = (n: number): string => [
        `### FR-${n}: Requirement ${n}`,
        `**Objective:** ${'o'.repeat(1400)}`,
        `**EARS Specification:** The system SHALL ${'e'.repeat(1400)}.`,
        `**Acceptance Criteria:** 1. ${'a'.repeat(1400)}`,
      ].join('\n');
      const big = ['# Requirements', ...Array.from({ length: 20 }, (_, i) => section(i + 1))].join('\n');
      await project.submit('requirements', big);
      const result = await service().check(request('requirements'));
      expect(result.truncated).toBe(true);
      const { state, questions } = posted();
      expect(Buffer.byteLength(JSON.stringify(state), 'utf8')).toBeLessThanOrEqual(32768);
      expect(state.items.length).toBeLessThan(20);
      const sent = state.items.map((item) => item.id as string);
      expect(Object.keys(questions).some((id) => id.startsWith('FR-20.'))).toBe(false);
      const stored = JSON.parse(await readFile(path.join(reviewDir(), (await sidecars())[0]!), 'utf8'));
      expect(stored.truncated).toBe(true);
      expect(stored.omittedIds.length).toBe(20 - sent.length);
      expect(stored.omittedIds).toContain('FR-20');
    });
  });

  describe('design', () => {
    const submitUpstream = async (): Promise<void> => {
      await project.approve('requirements', await project.submit('requirements', FIXTURE_REQUIREMENTS));
      await project.submit('design', FIXTURE_DESIGN);
    };

    it('flags a partly satisfied decision and an NFR without a mechanism', async () => {
      await submitUpstream();
      http.respond = async (req) => ({
        status: 200,
        body: benignAnswers(req.body, { 'D-1.fidelity': { choice: 'partly' }, 'NFR-1.mechanism': { choice: 'none' } }),
      });
      const result = await service().check(request('design'));
      expect(result).toMatchObject({ status: 'answered', flagged: ['D-1', 'NFR-1'], line: 'JEV: 2 flagged (D-1, NFR-1)' });
      const { state, questions } = posted();
      expect(state.kind).toBe('design');
      expect(Object.keys(questions).sort()).toEqual(['D-1.failure', 'D-1.fidelity', 'NFR-1.mechanism']);
      const decision = state.items.find((item) => item.id === 'D-1')!;
      expect(JSON.stringify(decision)).toContain('Commit the order atomically');
      expect(JSON.stringify(decision)).toContain('create an order');
      const nfr = state.items.find((item) => item.id === 'NFR-1')!;
      expect(JSON.stringify(nfr)).toContain('two seconds');
      expect(JSON.stringify(nfr)).toContain('Commit the order atomically');
    });

    it('flags weak failure handling', async () => {
      await submitUpstream();
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'D-1.failure': { score: 1 } }) });
      expect((await service().check(request('design'))).flagged).toEqual(['D-1']);
    });
  });

  describe('failures', () => {
    const reasonCases: Array<[string, () => Promise<{ status: number; body: string }>, string]> = [
      ['a rejecting transport', async () => { throw new JevTransportError('network'); }, 'network'],
      ['a transport timeout', async () => { throw new JevTransportError('timeout'); }, 'timeout'],
      ['an oversized body', async () => { throw new JevTransportError('too-large'); }, 'invalid-response'],
      ['an unexpected exception', async () => { throw new Error(`leak ${TEST_KEY}`); }, 'network'],
      ['HTTP 503', async () => ({ status: 503, body: '' }), 'http-503'],
      ['a redirect', async () => ({ status: 302, body: '' }), 'http-302'],
      ['a malformed body', async () => ({ status: 200, body: 'not json' }), 'invalid-response'],
      ['an answer outside the declared labels', async () => ({ status: 200, body: JSON.stringify({ answers: {} }) }), 'invalid-response'],
    ];

    it.each(reasonCases)('maps %s to its reason after exactly one attempt and persists it', async (_name, respond, reason) => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      http.respond = respond as never;
      const result = await service().check(request('requirements'));
      expect(result).toMatchObject({ status: 'unavailable', reason, line: `JEV: unavailable (${reason})`, persisted: true });
      expect(http.calls).toHaveLength(1);
      const [file] = await sidecars();
      const stored = JSON.parse(await readFile(path.join(reviewDir(), file!), 'utf8'));
      expect(stored).toMatchObject({ status: 'unavailable', reason });
      expect(JSON.stringify(result)).not.toContain(TEST_KEY);
      expect(await readAllFiles(reviewDir())).not.toContain(TEST_KEY);
    });

    it('returns timeout within the configured timeout when the transport never responds', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      http.respond = () => new Promise(() => undefined);
      const started = Date.now();
      const result = await service({ ...ACTIVE, SDD_JEV_TIMEOUT_MS: '1000' }).check(request('requirements'));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'timeout' });
      expect(Date.now() - started).toBeLessThan(1500);
      expect(http.calls).toHaveLength(1);
      expect(http.calls[0]!.timeoutMs).toBe(1000);
    });

    it('does not reuse an unavailable sidecar and makes a fresh single attempt', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      http.respond = async () => ({ status: 503, body: '' });
      await service().check(request('requirements'));
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body) });
      const second = await service().check(request('requirements'));
      expect(second.status).toBe('answered');
      expect(http.calls).toHaveLength(2);
    });
  });

  describe('sidecar binding', () => {
    it('reuses a matching sidecar without another request', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      http.respond = async (req) => ({ status: 200, body: benignAnswers(req.body, { 'FR-1.testability': { score: 1 } }) });
      const first = await service().check(request('requirements'));
      const second = await service().check(request('requirements'));
      expect(http.calls).toHaveLength(1);
      expect(second).toMatchObject({ status: 'answered', flagged: ['FR-1'], line: first.line, persisted: true, sidecar: first.sidecar });
    });

    it('ignores the earlier sidecar once the artifact changes', async () => {
      const first = await project.submit('requirements', FIXTURE_REQUIREMENTS);
      await service().check(request('requirements'));
      const changed = FIXTURE_REQUIREMENTS.replace('within two seconds', 'within one second');
      const second = await project.submit('requirements', changed, first.revision, first.artifact.sha256);
      expect(second.revision).toBe(first.revision + 1);
      const result = await service().check(request('requirements'));
      expect(http.calls).toHaveLength(2);
      expect(result.sidecar).toBe(`.spec/specs/payments/review/jev-requirements-r${second.revision}.json`);
      expect(http.calls[1]!.body).toContain('within one second');
    });

    it('ignores a tampered sidecar whose stored hash no longer matches', async () => {
      const submitted = await project.submit('requirements', FIXTURE_REQUIREMENTS);
      await service().check(request('requirements'));
      const file = path.join(reviewDir(), `jev-requirements-r${submitted.revision}.json`);
      const stored = JSON.parse(await readFile(file, 'utf8'));
      stored.binding.artifactSha256 = 'f'.repeat(64);
      await writeFile(file, JSON.stringify(stored));
      await service().check(request('requirements'));
      expect(http.calls).toHaveLength(2);
    });

    it('leaves the spec files untouched', async () => {
      await project.submit('requirements', FIXTURE_REQUIREMENTS);
      const featureDir = path.join(project.root, '.spec', 'specs', project.feature);
      const before = (await snapshotTree(featureDir)).filter((line) => !line.startsWith('review'));
      await service().check(request('requirements'));
      const after = (await snapshotTree(featureDir)).filter((line) => !line.startsWith('review'));
      expect(after).toEqual(before);
    });
  });
});

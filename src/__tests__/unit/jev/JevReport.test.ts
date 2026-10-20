import {
  allowedSeverityIndexes,
  flagDesign,
  flagRed,
  flagRequirements,
  flagSecurity,
  flagTestcases,
  renderCommitWarning,
  renderJevLine,
  violatedPrinciples,
} from '../../../application/services/JevReport';
import type { JevAnswer } from '../../../application/services/JevResponseValidator';

type Answers = Record<string, JevAnswer>;
const c = (choice: string): JevAnswer => ({ type: 'choice', choice });
const s = (index: number): JevAnswer => ({ type: 'score', raw: index, index });
const n = (noul: number): JevAnswer => ({ type: 'noul', noul });

describe('renderJevLine', () => {
  it.each(['disabled', 'no-key', 'network', 'timeout', 'http-503', 'invalid-response', 'code-disabled'])(
    'renders unavailable (%s) on one line',
    (reason) => {
      const line = renderJevLine({ status: 'unavailable', reason, flagged: [] });
      expect(line).toBe(`JEV: unavailable (${reason})`);
      expect(line).not.toContain('\n');
    },
  );

  it('renders no flags, a short list, and a truncated list', () => {
    expect(renderJevLine({ status: 'answered', flagged: [] })).toBe('JEV: no flags');
    expect(renderJevLine({ status: 'answered', flagged: ['FR-2', 'FR-5'] })).toBe('JEV: 2 flagged (FR-2, FR-5)');
    expect(renderJevLine({ status: 'answered', flagged: ['A', 'B', 'C'] })).toBe('JEV: 3 flagged (A, B, C)');
    expect(renderJevLine({ status: 'answered', flagged: ['A', 'B', 'C', 'D', 'E'] })).toBe('JEV: 5 flagged (A, B, C, +2 more)');
  });

  it('renders null for skipped results', () => {
    expect(renderJevLine({ status: 'skipped', flagged: [] })).toBeNull();
  });

  it('renders the commit warning as one line', () => {
    expect(renderCommitWarning(2)).toBe('JEV: warning (2 confirmed high/critical security findings in staged changes)');
  });
});

describe('flagRequirements', () => {
  const base: Answers = {
    'goal.scope': c('all'),
    'goal.clarification': n(0.1),
  };
  const req = (id: string, testability: number, ambiguity: string): Answers => ({
    [`${id}.testability`]: s(testability),
    [`${id}.ambiguity`]: c(ambiguity),
  });

  it('flags testability index 1 but not 2', () => {
    expect(flagRequirements({ ...base, ...req('FR-1', 1, 'bounded'), ...req('FR-2', 2, 'bounded') }, ['FR-1', 'FR-2'])).toEqual(['FR-1']);
  });

  it('flags unbounded wording', () => {
    expect(flagRequirements({ ...base, ...req('FR-1', 3, 'unbounded') }, ['FR-1'])).toEqual(['FR-1']);
  });

  it('flags goal on partial scope and on noul 0.5 but not 0.49', () => {
    expect(flagRequirements({ ...base, ...req('FR-1', 3, 'bounded'), 'goal.scope': c('partly') }, ['FR-1'])).toEqual(['goal']);
    expect(flagRequirements({ ...base, ...req('FR-1', 3, 'bounded'), 'goal.clarification': n(0.5) }, ['FR-1'])).toEqual(['goal']);
    expect(flagRequirements({ ...base, ...req('FR-1', 3, 'bounded'), 'goal.clarification': n(0.49) }, ['FR-1'])).toEqual([]);
  });
});

describe('flagDesign', () => {
  it('flags partial fidelity, weak failure handling, and missing NFR mechanisms in document order', () => {
    const answers: Answers = {
      'D-1.fidelity': c('fully'), 'D-1.failure': s(2),
      'D-2.fidelity': c('partly'), 'D-2.failure': s(3),
      'D-3.fidelity': c('fully'), 'D-3.failure': s(1),
      'NFR-1.mechanism': c('none'),
      'NFR-2.mechanism': c('concrete'),
    };
    expect(flagDesign(answers, ['D-1', 'D-2', 'D-3'], ['NFR-1', 'NFR-2'])).toEqual(['D-2', 'D-3', 'NFR-1']);
  });
});

describe('flagTestcases', () => {
  const ok = (id: string): Answers => ({
    [`${id}.coverage`]: s(3), [`${id}.missing`]: c('none-missing'), [`${id}.proportion`]: c('proportionate'),
    [`${id}.observability`]: c('public-interface'), [`${id}.noRed`]: n(0.1),
  });

  it('does not flag a healthy task', () => {
    expect(flagTestcases(ok('1.1'), [{ id: '1.1', notApplicable: false }])).toEqual([]);
  });

  it.each([
    ['coverage index 1', { '1.1.coverage': s(1) }],
    ['a missing category', { '1.1.missing': c('error') }],
    ['over-tested', { '1.1.proportion': c('over-tested') }],
    ['under-tested', { '1.1.proportion': c('under-tested') }],
    ['coupled assertions', { '1.1.observability': c('coupled') }],
    ['noul 0.5', { '1.1.noRed': n(0.5) }],
  ])('flags %s', (_name, override) => {
    expect(flagTestcases({ ...ok('1.1'), ...override }, [{ id: '1.1', notApplicable: false }])).toEqual(['1.1']);
  });

  it('does not flag coverage index 2 or noul 0.49', () => {
    expect(flagTestcases({ ...ok('1.1'), '1.1.coverage': s(2), '1.1.noRed': n(0.49) }, [{ id: '1.1', notApplicable: false }])).toEqual([]);
  });

  it('flags a not-applicable task whose reason is not justified', () => {
    const tasks = [{ id: '7.1', notApplicable: true }, { id: '7.2', notApplicable: true }];
    expect(flagTestcases({ '7.1.tddReason': c('not-justified'), '7.2.tddReason': c('justified') }, tasks)).toEqual(['7.1']);
  });
});

describe('flagRed', () => {
  it('flags a setup-error cause or setup probability of at least 0.5', () => {
    expect(flagRed({ 'red.cause': c('setup-error'), 'red.setup': n(0.1) })).toEqual(['red']);
    expect(flagRed({ 'red.cause': c('unclear'), 'red.setup': n(0.5) })).toEqual(['red']);
    expect(flagRed({ 'red.cause': c('missing-behavior'), 'red.setup': n(0.49) })).toEqual([]);
  });
});

describe('security triage', () => {
  const answers = (id: string, severity: number, extra: Partial<Record<string, JevAnswer>> = {}): Answers => ({
    [`${id}.classification`]: c('confirmed'),
    [`${id}.severity`]: s(severity),
    [`${id}.exploitability`]: n(0.8),
    [`${id}.remediation`]: c('yes'),
    ...(extra as Answers),
  });

  it('maps model severities onto allowed unified indexes', () => {
    expect(allowedSeverityIndexes('critical')).toEqual([4]);
    expect(allowedSeverityIndexes('important')).toEqual([2, 3]);
    expect(allowedSeverityIndexes('minor')).toEqual([1]);
    expect(allowedSeverityIndexes('high')).toEqual([3]);
    expect(allowedSeverityIndexes('medium')).toEqual([2]);
    expect(allowedSeverityIndexes('low')).toEqual([1]);
  });

  it('treats important vs medium as agreement and important vs low as disagreement', () => {
    const agree = flagSecurity(answers('F1', 2), [{ id: 'F1', modelSeverity: 'important' }]);
    expect(agree.flagged).toEqual([]);
    expect(agree.items[0]).toMatchObject({ id: 'F1', jevSeverity: 'medium', disagreement: false });
    const disagree = flagSecurity(answers('F1', 1), [{ id: 'F1', modelSeverity: 'important' }]);
    expect(disagree.flagged).toEqual(['F1']);
    expect(disagree.items[0]).toMatchObject({ jevSeverity: 'low', disagreement: true });
  });

  it('flags false positives and incomplete remediations', () => {
    const fp = flagSecurity(answers('F1', 3, { 'F1.classification': c('false-positive') }), [{ id: 'F1', modelSeverity: 'high' }]);
    expect(fp.flagged).toEqual(['F1']);
    const remediation = flagSecurity(answers('F1', 3, { 'F1.remediation': c('partly') }), [{ id: 'F1', modelSeverity: 'high' }]);
    expect(remediation.flagged).toEqual(['F1']);
  });
});

describe('violatedPrinciples', () => {
  const unit = (id: string, overrides: Record<string, string>): Answers =>
    Object.fromEntries(
      ['srp', 'dry', 'kissYagni', 'dip', 'swallowedErrors', 'sensitiveLogging'].map((key) => [`${id}.${key}`, c(overrides[key] ?? 'followed')]),
    );

  it('reports only violated answers with their location', () => {
    const answers = { ...unit('U1', { srp: 'violated', dry: 'partly', dip: 'not-applicable' }), ...unit('U2', { swallowedErrors: 'violated' }) };
    const units = [
      { id: 'U1', location: 'src/a.ts:10' },
      { id: 'U2', location: 'src/b.ts:42' },
    ];
    expect(violatedPrinciples(answers, units)).toEqual([
      { unitId: 'U1', principle: 'srp', location: 'src/a.ts:10' },
      { unitId: 'U2', principle: 'swallowedErrors', location: 'src/b.ts:42' },
    ]);
  });

  it('reports nothing when every answer is followed', () => {
    expect(violatedPrinciples(unit('U1', {}), [{ id: 'U1', location: 'src/a.ts:1' }])).toEqual([]);
  });
});

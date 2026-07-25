import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const skillRoot = path.join(root, 'skills');
const agentRoot = path.join(root, 'agents');

const skillNames = [
  'sdd-commit',
  'sdd-design',
  'sdd-implement',
  'sdd-requirements',
  'sdd-review',
  'sdd-security-check',
  'sdd-steering',
  'sdd-steering-custom',
  'sdd-tasks',
  'sdd-test-gen',
  'simple-task',
] as const;

const requiredCoreChecks: Record<typeof skillNames[number], RegExp[]> = {
  'sdd-commit': [/inspect.*changes/i, /never.*secret/i, /focused.*test/i],
  'sdd-design': [/requirements.*approved/i, /approved compact context/i, /approve this design/i],
  'sdd-implement': [/tasks.*approved/i, /red.*green.*refactor/is, /record.*blocker/i, /security/i],
  'sdd-requirements': [/ears/i, /acceptance criteria/i, /approve these requirements/i],
  'sdd-review': [/correctness/i, /security/i, /verification/i],
  'sdd-security-check': [/owasp/i, /secret/i, /severity/i],
  'sdd-steering': [/preserve.*user/i, /security/i, /validate/i],
  'sdd-steering-custom': [/fileName/i, /\.md/, /preserve.*user/i],
  'sdd-tasks': [/design.*approved/i, /test.case.review/i, /approve these implementation tasks/i],
  'sdd-test-gen': [/failing.*test/i, /observable.*behavior/i, /focused.*test/i],
  'simple-task': [/failing.*test/i, /security/i, /focused.*test/i],
};

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function utf8Bytes(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

describe('canonical progressive assets', () => {
  it('keeps every skill manual-only, concise, bounded, and safety-complete', () => {
    let totalBytes = 0;
    let totalDescriptionBytes = 0;

    for (const skillName of skillNames) {
      const content = read(`skills/${skillName}/SKILL.md`);
      const description = content.match(/^description:\s*(.+)$/m)?.[1];

      expect(content).toMatch(/^disable-model-invocation:\s*true$/m);
      expect(description).toBeDefined();
      expect(utf8Bytes(description!)).toBeLessThanOrEqual(140);
      expect(description).toMatch(/^(Create|Design|Generate|Implement|Review|Audit|Commit|Define)/);
      expect(utf8Bytes(content)).toBeLessThanOrEqual(4_000);
      for (const check of requiredCoreChecks[skillName]) expect(content).toMatch(check);
      totalBytes += utf8Bytes(content);
      totalDescriptionBytes += utf8Bytes(description!);
    }

    expect(totalBytes).toBeLessThanOrEqual(40_000);
    expect(totalDescriptionBytes).toBeLessThanOrEqual(1_400);
  });

  it('links every optional reference to an existing contained Markdown file', () => {
    for (const skillName of skillNames) {
      const content = read(`skills/${skillName}/SKILL.md`);
      const references = [...content.matchAll(/\[[^\]]+\]\((REFERENCE\.md|references\/[A-Za-z0-9._/-]+\.md)\)/g)]
        .map(match => match[1]);

      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        const resolved = path.resolve(skillRoot, skillName, reference);
        expect(resolved.startsWith(`${path.resolve(skillRoot, skillName)}${path.sep}`)).toBe(true);
        expect(fs.statSync(resolved).isFile()).toBe(true);
      }
    }
  });


  it('keeps the formal phase lifecycle inside canonical Skills', () => {
    const requirements = read('skills/sdd-requirements/SKILL.md');
    const design = read('skills/sdd-design/SKILL.md');
    const tasks = read('skills/sdd-tasks/SKILL.md');
    const implement = read('skills/sdd-implement/SKILL.md');

    expect(requirements).toMatch(/missing feature.*internally initialize/is);
    expect(requirements).toMatch(/no supplied name.*sole incomplete feature/is);
    expect(requirements).toMatch(/clarification.*retry initialization/is);

    for (const content of [requirements, design, tasks]) {
      expect(content).toMatch(/compact approved context|approved compact context/i);
      expect(content).toMatch(/exact revision and artifact/i);
      expect(content).toMatch(/reread status/i);
      expect(content).toMatch(/never (ask|tell).*raw MCP|never ask.*backend tool/is);
    }

    expect(tasks).toMatch(/saved test-case-review choice is authoritative/i);
    expect(tasks).toMatch(/separate from approval/i);
    expect(implement).toMatch(/record.*non-zero exit code/is);
    expect(implement).toMatch(/record.*zero exit code/is);
    expect(implement).toMatch(/affected project-relative artifacts/i);
    expect(implement).toMatch(/resume.*persisted/is);
  });
  it('keeps serial execution local and bounds advisor handoffs', () => {
    for (const skillName of ['sdd-implement', 'sdd-test-gen', 'simple-task', 'sdd-commit']) {
      const content = read(`skills/${skillName}/SKILL.md`);
      expect(content).toMatch(/execute.*in this turn|run.*locally|work inline/i);
      expect(content).not.toMatch(/^## Specialist Delegation$/m);
    }

    for (const skillName of ['sdd-requirements', 'sdd-design', 'sdd-review', 'sdd-security-check', 'sdd-steering', 'sdd-steering-custom', 'sdd-tasks']) {
      const content = read(`skills/${skillName}/SKILL.md`);
      expect(content).toMatch(/specialistDepth:\s*1/);
      expect(content).toMatch(/exactly one/i);
      expect(content).toMatch(/unavailable.*continue.*parent/is);
      expect(content).toMatch(/2,048 estimated tokens/i);
    }
  });

  it('bounds specialist bodies and requires their compact result contract', () => {
    const files = fs.readdirSync(agentRoot).filter(file => file.endsWith('.md')).sort();
    expect(files).toHaveLength(6);

    let totalBytes = 0;
    for (const file of files) {
      const content = read(`agents/${file}`);
      expect(utf8Bytes(content)).toBeLessThanOrEqual(4_000);
      expect(content).toMatch(/## Result Contract/);
      expect(content).toMatch(/decisions/i);
      expect(content).toMatch(/affected artifacts/i);
      expect(content).toMatch(/verification evidence/i);
      expect(content).toMatch(/unresolved blockers/i);
      expect(content).toMatch(/2,048 estimated tokens/i);
      totalBytes += utf8Bytes(content);
    }
    expect(totalBytes).toBeLessThanOrEqual(18_000);
  });

  it('moves duplicate workflow rules into the commit reference', () => {
    expect(fs.existsSync(path.join(root, 'rules/git-workflow.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'rules/sdd-workflow.md'))).toBe(false);
    const commitReference = read('skills/sdd-commit/REFERENCE.md');
    expect(commitReference).toMatch(/commit message/i);
    expect(commitReference).toMatch(/branch/i);
    expect(commitReference).toMatch(/pull request/i);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the ESM release script in a real Node process, like the context reporter tests.
const releaseUrl = pathToFileURL(path.resolve('scripts/release.mjs')).href;
const bridge = `
  const request = JSON.parse(process.env.RELEASE_REQUEST);
  const release = await import(${JSON.stringify(releaseUrl)});
  try {
    const value = await release[request.name](...request.args);
    process.stdout.write(JSON.stringify({ ok: true, value }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  }
`;

function call(name: string, ...args: unknown[]): any {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', bridge], {
    cwd: process.cwd(),
    env: { ...process.env, RELEASE_REQUEST: JSON.stringify({ name, args }) },
    encoding: 'utf8',
  });
  const result = JSON.parse(output);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('decideBump', () => {
  it.each([
    [['fix: repair parser'], 'patch'],
    [['docs: reword guide'], 'patch'],
    [['feat(skills): add ladder', 'fix: typo'], 'minor'],
    [['feat!: drop v4 payloads'], 'major'],
    [['refactor(api): rename field\n\nBREAKING CHANGE: field renamed'], 'major'],
  ])('derives the bump from %j', (messages, expected) => {
    expect(call('decideBump', messages, [])).toBe(expected);
  });

  it('ignores earlier release-preparation commits', () => {
    expect(call('decideBump', ['chore(release): prepare 6.0.0', 'fix: a'], [])).toBe('patch');
  });

  it('lets one release label override the commit-derived bump', () => {
    expect(call('decideBump', ['feat: big'], ['release:patch'])).toBe('patch');
    expect(call('decideBump', ['fix: small'], ['bug', 'release:major'])).toBe('major');
  });

  it('rejects more than one release label', () => {
    expect(() => call('decideBump', ['fix: a'], ['release:minor', 'release:major'])).toThrow(/one release label/);
  });
});

describe('nextVersion', () => {
  it.each([
    ['patch', '5.3.1'],
    ['minor', '5.4.0'],
    ['major', '6.0.0'],
  ])('applies a %s bump to 5.3.0', (bump, expected) => {
    expect(call('nextVersion', '5.3.0', bump)).toBe(expected);
  });

  it('rejects a version that is not plain semver', () => {
    expect(() => call('nextVersion', '5.3', 'patch')).toThrow(/semver/);
    expect(() => call('nextVersion', '5.3.0', 'huge')).toThrow(/bump/);
  });
});

describe('latestVersion', () => {
  it('picks the highest semver tag, not the nearest or newest-named one', () => {
    expect(call('latestVersion', ['v5.2.0', 'v5.10.0', 'v5.3.0', 'v5.9.1', 'docs-1', 'v6.0.0-rc.1'])).toBe('5.10.0');
  });

  it('fails when no version tag exists', () => {
    expect(() => call('latestVersion', ['docs-1'])).toThrow(/no vX\.Y\.Z tag/);
  });
});

describe('planRelease', () => {
  it('always plans from the released tag, so a rerun gives the same target', () => {
    const plan = call('planRelease', { released: '5.3.0', current: '5.4.0', messages: ['feat: x'], labels: [] });
    expect(plan).toEqual({ released: '5.3.0', current: '5.4.0', bump: 'minor', next: '5.4.0' });
  });
});

const PLUGIN_JSON = '{\n  "name": "sdd-mcp",\n  "version": "5.3.0",\n  "keywords": ["sdd", "mcp"],\n  "skills": { "path": "skills" }\n}\n';

describe('applyVersion', () => {
  async function fixture(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'sdd-release-'));
    await mkdir(path.join(root, '.claude-plugin'));
    await mkdir(path.join(root, 'docs'));
    await mkdir(path.join(root, 'src/shared'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'sdd-mcp-server', version: '5.3.0' }, null, 2) + '\n');
    await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({
      name: 'sdd-mcp-server', version: '5.3.0', lockfileVersion: 3,
      packages: { '': { name: 'sdd-mcp-server', version: '5.3.0' }, 'node_modules/estraverse': { version: '5.3.0' } },
    }, null, 2) + '\n');
    await writeFile(path.join(root, '.claude-plugin/plugin.json'), PLUGIN_JSON);
    await writeFile(path.join(root, 'src/shared/version.ts'), "export const PACKAGE_VERSION = '5.3.0';\n");
    await writeFile(path.join(root, 'README.md'), '> **v5.3.0** — highlights\n\nnpx sdd-mcp-server@5.3.0 install\n');
    await writeFile(path.join(root, 'docs/INSTALL-GUIDE.md'), [
      'SDD_MCP_PACKAGE=file:/tmp/sdd-mcp-server-5.3.0.tgz ./bootstrap.sh',
      'npx sdd-mcp-server@5.3.0 install',
      'For an update from 5.2.0 to 5.3.0, rerun the installer.',
      '',
    ].join('\n'));
    await writeFile(path.join(root, 'CHANGELOG.md'), [
      '# Changelog', '', '## [Unreleased]', '', '### Added', '- New skill.', '', '## [5.3.0] - 2026-10-02', '', '- Old.', '',
    ].join('\n'));
    return root;
  }

  const read = (root: string, file: string) => readFile(path.join(root, file), 'utf8');

  it('writes the target version everywhere and dates the Unreleased section', async () => {
    const root = await fixture();
    const changed = call('applyVersion', { root, from: '5.3.0', released: '5.3.0', to: '5.4.0', date: '2026-10-05' });

    expect(changed.sort()).toEqual([
      '.claude-plugin/plugin.json', 'CHANGELOG.md', 'README.md', 'docs/INSTALL-GUIDE.md',
      'package-lock.json', 'package.json', 'src/shared/version.ts',
    ]);
    expect(JSON.parse(await read(root, 'package.json')).version).toBe('5.4.0');
    const lock = JSON.parse(await read(root, 'package-lock.json'));
    expect([lock.version, lock.packages[''].version, lock.packages['node_modules/estraverse'].version]).toEqual(['5.4.0', '5.4.0', '5.3.0']);
    expect(await read(root, '.claude-plugin/plugin.json')).toBe(PLUGIN_JSON.replace('"version": "5.3.0"', '"version": "5.4.0"'));
    expect(await read(root, 'src/shared/version.ts')).toBe("export const PACKAGE_VERSION = '5.4.0';\n");

    const readme = await read(root, 'README.md');
    expect(readme).toContain('npx sdd-mcp-server@5.4.0 install');
    expect(readme).toContain('> **v5.3.0** — highlights');
    const guide = await read(root, 'docs/INSTALL-GUIDE.md');
    expect(guide).toContain('sdd-mcp-server-5.4.0.tgz');
    expect(guide).toContain('npx sdd-mcp-server@5.4.0 install');
    expect(guide).toContain('For an update from 5.2.0 to 5.3.0');

    const changelog = await read(root, 'CHANGELOG.md');
    expect(changelog).toContain('## [Unreleased]\n\n## [5.4.0] - 2026-10-05\n\n### Added\n- New skill.');
    expect(changelog).toContain('## [5.3.0] - 2026-10-02');
  });

  it('retargets a prepared version and folds new Unreleased entries into it', async () => {
    const root = await fixture();
    call('applyVersion', { root, from: '5.3.0', released: '5.3.0', to: '5.4.0', date: '2026-10-05' });
    const changelogPath = path.join(root, 'CHANGELOG.md');
    const prepared = await readFile(changelogPath, 'utf8');
    await writeFile(changelogPath, prepared.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Fixed\n- Late fix.\n'));

    call('applyVersion', { root, from: '5.4.0', released: '5.3.0', to: '6.0.0', date: '2026-10-06' });

    expect(JSON.parse(await read(root, 'package.json')).version).toBe('6.0.0');
    expect(await read(root, 'README.md')).toContain('sdd-mcp-server@6.0.0');
    const changelog = await read(root, 'CHANGELOG.md');
    expect(changelog).not.toContain('## [5.4.0]');
    expect(changelog).toContain('## [Unreleased]\n\n## [6.0.0] - 2026-10-06\n\n### Fixed\n- Late fix.\n\n### Added\n- New skill.');
  });

  it('changes nothing when the files already hold the target', async () => {
    const root = await fixture();
    call('applyVersion', { root, from: '5.3.0', released: '5.3.0', to: '5.4.0', date: '2026-10-05' });
    expect(call('applyVersion', { root, from: '5.4.0', released: '5.3.0', to: '5.4.0', date: '2026-10-05' })).toEqual([]);
  });
});

describe('releaseNotes', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n\n## [5.4.0] - 2026-10-05\n\n### Added\n- New skill.\n\n## [5.3.0] - 2026-10-02\n\n- Old.\n';

  it('returns the body of one version section', () => {
    expect(call('releaseNotes', changelog, '5.4.0')).toBe('### Added\n- New skill.');
  });

  it('fails when the version has no section', () => {
    expect(() => call('releaseNotes', changelog, '9.9.9')).toThrow(/9\.9\.9/);
  });
});

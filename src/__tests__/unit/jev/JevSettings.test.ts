import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readProjectJevSetting, resolveJevSettings } from '../../../application/services/JevSettings';

const KEY = 'sk-test-abcdef123456';

describe('resolveJevSettings', () => {
  it('is disabled by default with no env and no project setting', () => {
    const settings = resolveJevSettings({}, undefined);
    expect(settings.enabled).toBe(false);
    expect(settings.allowCode).toBe(false);
    expect(settings.timeoutMs).toBe(5000);
  });

  it.each(['1', 'TRUE', 'yes', 'On', ' on '])('enables JEV for %p', (value) => {
    expect(resolveJevSettings({ SDD_JEV_ENABLED: value }, undefined).enabled).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', 'maybe', '2'])('disables JEV for %p even when the project setting is true', (value) => {
    expect(resolveJevSettings({ SDD_JEV_ENABLED: value }, true).enabled).toBe(false);
  });

  it('uses the project setting only when the env value is unset or empty', () => {
    expect(resolveJevSettings({}, true).enabled).toBe(true);
    expect(resolveJevSettings({ SDD_JEV_ENABLED: '' }, true).enabled).toBe(true);
    expect(resolveJevSettings({}, false).enabled).toBe(false);
  });

  it.each([undefined, '', '   ', 'bad\r\nkey', 'bad\nkey', `a${'b'.repeat(512)}`, 'has space', 'tab\tkey'])(
    'treats key %p as missing',
    (value) => {
      const settings = resolveJevSettings({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: value }, undefined);
      expect(settings.hasKey).toBe(false);
      expect(settings.apiKey()).toBeUndefined();
    },
  );

  it('accepts a trimmed visible-ASCII key of up to 512 characters', () => {
    const settings = resolveJevSettings({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: `  ${KEY}  ` }, undefined);
    expect(settings.hasKey).toBe(true);
    expect(settings.apiKey()).toBe(KEY);
    expect(resolveJevSettings({ SDD_JEV_API_KEY: 'k'.repeat(512) }, undefined).hasKey).toBe(true);
  });

  it('applies the same truthy set to the code opt-in with no project fallback', () => {
    expect(resolveJevSettings({ SDD_JEV_ALLOW_CODE: 'Yes' }, true).allowCode).toBe(true);
    expect(resolveJevSettings({ SDD_JEV_ALLOW_CODE: 'nope' }, true).allowCode).toBe(false);
    expect(resolveJevSettings({}, true).allowCode).toBe(false);
  });

  it.each([
    [undefined, 5000],
    ['500', 1000],
    ['1000', 1000],
    ['7000', 7000],
    ['15000', 15000],
    ['20000', 15000],
    ['7.5', 5000],
    ['abc', 5000],
    ['-5', 5000],
    ['', 5000],
  ])('maps SDD_JEV_TIMEOUT_MS %p to %p', (value, expected) => {
    expect(resolveJevSettings({ SDD_JEV_TIMEOUT_MS: value }, undefined).timeoutMs).toBe(expected);
  });

  it('never exposes the key through serialization or string conversion', () => {
    const settings = resolveJevSettings({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: KEY }, undefined);
    expect(JSON.stringify(settings)).not.toContain(KEY);
    expect(String(settings)).not.toContain(KEY);
    expect(JSON.stringify(settings)).toContain('"hasKey":true');
  });
});

describe('readProjectJevSetting', () => {
  let root: string;
  const writeConfig = (content: string): void => {
    fs.mkdirSync(path.join(root, '.spec'), { recursive: true });
    fs.writeFileSync(path.join(root, '.spec', 'sdd-config.json'), content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-settings-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns undefined and creates nothing when the file is missing', async () => {
    await expect(readProjectJevSetting(root)).resolves.toBeUndefined();
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('reads a boolean jev.enabled value', async () => {
    writeConfig('{"jev":{"enabled":true}}');
    await expect(readProjectJevSetting(root)).resolves.toBe(true);
    writeConfig('{"jev":{"enabled":false}}');
    await expect(readProjectJevSetting(root)).resolves.toBe(false);
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['non-boolean value', '{"jev":{"enabled":"true"}}'],
    ['missing jev object', '{}'],
    ['array root', '[]'],
    ['oversized file', `{"jev":{"enabled":true},"pad":"${'x'.repeat(17 * 1024)}"}`],
  ])('treats %s as no setting', async (_name, content) => {
    writeConfig(content);
    await expect(readProjectJevSetting(root)).resolves.toBeUndefined();
  });

  it('ignores an apiKey placed in the file', async () => {
    writeConfig('{"jev":{"enabled":true,"apiKey":"sk-from-file-123456"}}');
    await expect(readProjectJevSetting(root)).resolves.toBe(true);
    const settings = resolveJevSettings({ SDD_JEV_ENABLED: '1' }, true);
    expect(settings.hasKey).toBe(false);
  });
});

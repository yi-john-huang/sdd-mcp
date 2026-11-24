import { unmatchedArtifacts } from '../../../application/services/ObservedArtifactCheck';

describe('unmatchedArtifacts', () => {
  const exists = (known: readonly string[]) => async (file: string): Promise<boolean> => known.includes(file);

  it.each<[string, string]>([
    ['a trailing slash on the spec root', '.spec/specs/'],
    ['the spec root without a slash', '.spec/specs'],
    ['a spec file', '.spec/specs/payments/tasks.md'],
  ])('checks %s for existence', async (...[, artifact]) => {
    const known = ['.spec/specs', '.spec/specs/payments/tasks.md'];
    await expect(unmatchedArtifacts([artifact], [], exists(known))).resolves.toEqual([]);
  });

  it.each<[string, string]>([
    ['an interior ./ segment', 'src/./parser.ts'],
    ['a doubled separator', 'src//parser.ts'],
    ['a leading ./', './src/parser.ts'],
    ['a directory with a trailing slash', 'src/'],
    ['a Windows separator', 'src\\parser.ts'],
  ])('matches a changed path written with %s', async (...[, artifact]) => {
    await expect(unmatchedArtifacts([artifact], ['src/parser.ts'], exists([]))).resolves.toEqual([]);
  });

  it('reports an artifact that did not change, as the caller wrote it', async () => {
    await expect(unmatchedArtifacts(['src/./other.ts'], ['src/parser.ts'], exists([]))).resolves.toEqual(['src/./other.ts']);
  });

  it('does not treat a spec-like sibling as a spec path', async () => {
    await expect(unmatchedArtifacts(['.spec/specsx/a.md'], [], exists(['.spec/specsx/a.md']))).resolves.toEqual(['.spec/specsx/a.md']);
  });
});

#!/usr/bin/env node
// Lint no-new-warnings ratchet.
//   node scripts/lint-ratchet.mjs           fail on ESLint errors or any warning count above the baseline
//   node scripts/lint-ratchet.mjs --lower   rewrite the baseline with min(baseline, current); never raises a count
//   node scripts/lint-ratchet.mjs --init    maintainer-only: create the baseline from the current tree

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASELINE = 'scripts/lint-baseline.json';
const REMEDIATION = 'Fix the new warning, or run npm run lint:baseline after removing warnings.';

export function countWarnings(results, cwd = process.cwd()) {
  const counts = {};
  for (const result of results) {
    const file = path.relative(cwd, result.filePath).split(path.sep).join('/');
    for (const message of result.messages) {
      if (message.severity !== 1) continue;
      const key = `${file}|${message.ruleId ?? 'unknown'}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return sortKeys(counts);
}

export function compare(baseline, current) {
  const lines = [];
  for (const key of Object.keys(current).sort()) {
    const before = baseline[key] ?? 0;
    if (current[key] > before) {
      const [file, rule] = key.split('|');
      lines.push(`${file}  ${rule}  ${before} → ${current[key]}`);
    }
  }
  return { ok: lines.length === 0, lines };
}

export function lower(baseline, current) {
  const lowered = {};
  for (const [key, count] of Object.entries(baseline)) {
    const next = Math.min(count, current[key] ?? 0);
    if (next > 0) lowered[key] = next;
  }
  return sortKeys(lowered);
}

function sortKeys(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

class BaselineError extends Error {}

async function readBaseline(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new BaselineError(`Lint baseline ${file} is missing. Run node scripts/lint-ratchet.mjs --init once to create it.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BaselineError(`Lint baseline ${file} is not valid JSON. Restore it from git.`);
  }
  const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.entries(parsed).every(([key, count]) => key.includes('|') && Number.isSafeInteger(count) && count > 0);
  if (!valid) throw new BaselineError(`Lint baseline ${file} must map "file|rule" keys to positive integers. Restore it from git.`);
  return parsed;
}

async function lint() {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['src/**/*.ts']);
  const errors = results.filter((result) => result.errorCount > 0);
  return { results, errors, eslint };
}

async function main(argv) {
  const mode = argv.includes('--init') ? 'init' : argv.includes('--lower') ? 'lower' : 'check';
  const baselineIndex = argv.indexOf('--baseline');
  const baselineFile = baselineIndex >= 0 ? argv[baselineIndex + 1] : DEFAULT_BASELINE;
  const baseline = mode === 'init' ? undefined : await readBaseline(baselineFile);

  const { results, errors, eslint } = await lint();
  if (errors.length > 0) {
    const formatter = await eslint.loadFormatter('stylish');
    process.stderr.write(await formatter.format(errors));
    return 1;
  }
  const current = countWarnings(results);

  if (mode !== 'check') {
    const next = mode === 'init' ? current : lower(baseline, current);
    await writeFile(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
    const total = Object.values(next).reduce((sum, count) => sum + count, 0);
    process.stdout.write(`Wrote ${baselineFile} with ${total} warnings.\n`);
    return 0;
  }

  const outcome = compare(baseline, current);
  if (!outcome.ok) {
    process.stderr.write(`New lint warnings above the baseline:\n${outcome.lines.join('\n')}\n${REMEDIATION}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      if (error instanceof BaselineError) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 2;
        return;
      }
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 2;
    },
  );
}

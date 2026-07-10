#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const event = process.argv[2];

function sessionStart() {
  const specsRoot = path.resolve(process.cwd(), '.spec/specs');
  let entries;
  try {
    entries = fs.readdirSync(specsRoot, { withFileTypes: true });
  } catch {
    return { continue: true };
  }

  const states = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || states.length >= 12) continue;
    try {
      const spec = JSON.parse(
        fs.readFileSync(path.join(specsRoot, entry.name, 'spec.json'), 'utf8'),
      );
      const feature = String(spec.feature_name || spec.feature || entry.name).slice(0, 100);
      const phase = String(spec.phase || 'unknown').slice(0, 100);
      states.push(`${feature}: ${phase}`);
    } catch {
      // Ignore unreadable and malformed specs; hooks must never block a session.
    }
  }

  if (states.length === 0) return { continue: true };
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `SDD workflow state:\n${states.map(state => `- ${state}`).join('\n')}`,
    },
  };
}

function stop() {
  try {
    const status = execFileSync('git', ['status', '--short'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!status) return { continue: true };
    const count = status.split(/\r?\n/).length;
    return {
      continue: true,
      systemMessage: `Repository has ${count} uncommitted change${count === 1 ? '' : 's'}; review them before ending the task.`,
    };
  } catch {
    return { continue: true };
  }
}

let output = { continue: true };
try {
  if (event === 'session-start') output = sessionStart();
  if (event === 'stop') output = stop();
} catch {
  output = { continue: true };
}

process.stdout.write(`${JSON.stringify(output)}\n`);

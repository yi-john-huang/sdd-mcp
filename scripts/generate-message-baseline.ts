// Regenerates src/__tests__/fixtures/message-contract-baseline.json from the CURRENT source.
// Run only before any message edit:  npx tsx scripts/generate-message-baseline.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildContractSnapshot, loadAllMessages } from '../src/__tests__/helpers/message-extractor';

const messages = loadAllMessages();
const out = resolve('src/__tests__/fixtures/message-contract-baseline.json');
writeFileSync(out, `${JSON.stringify(buildContractSnapshot(messages), null, 2)}\n`);
const nonLiteral = messages.filter((m) => !m.literal);
console.log(`Wrote ${out}`);
for (const f of new Set(messages.map((m) => m.file))) console.log(f, messages.filter((m) => m.file === f).length);
console.log('non-literal:', JSON.stringify(nonLiteral.map((m) => `${m.file}:${m.line} ${m.code}`), null, 1));

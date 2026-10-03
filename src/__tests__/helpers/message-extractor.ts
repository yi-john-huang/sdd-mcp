import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export const MESSAGE_FILES = [
  'src/application/services/WorkflowValidationService.ts',
  'src/application/services/WorkflowEngineService.ts',
  'src/adapters/cli/SDDToolAdapter.ts',
  'src/infrastructure/mcp/ToolRegistry.ts',
] as const;

export const DYNAMIC_CODE = '<dynamic>';

export interface ExtractedMessage {
  file: string;
  code: string | null;
  message: string;
  line: number;
  literal: boolean;
}

export interface ContractSnapshot {
  files: Record<string, { codes: string[]; numbers: Record<string, string[]> }>;
}

/** Returns folded literal text, or undefined when the expression is not a literal. */
function literalText(node: ts.Expression): string | undefined {
  if (ts.isParenthesizedExpression(node)) return literalText(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => `X${s.literal.text}`).join('');
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = literalText(node.left);
    const r = literalText(node.right);
    return l !== undefined && r !== undefined ? l + r : undefined;
  }
  return undefined;
}

export function extractMessagesFromSource(file: string, text: string): ExtractedMessage[] {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  } catch (error) {
    throw new Error(`Cannot parse ${file}: ${(error as Error).message}`);
  }
  const parseDiagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) throw new Error(`Cannot parse ${file}: syntax errors`);

  const out: ExtractedMessage[] = [];
  const visit = (node: ts.Node): void => {
    const isBlocker =
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'blocker';
    const isGov =
      ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'GovernanceError';
    if ((isBlocker || isGov) && (node.arguments?.length ?? 0) >= 2) {
      const [codeArg, msgArg] = node.arguments!;
      const code = literalText(codeArg);
      const message = literalText(msgArg);
      out.push({
        file,
        code: code === undefined ? null : code,
        message: message ?? '',
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        literal: message !== undefined,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (out.length === 0) throw new Error(`No blocker or GovernanceError messages found in ${file}`);
  return out;
}

export function extractMessages(file: string, root = process.cwd()): ExtractedMessage[] {
  let text: string;
  try {
    text = readFileSync(resolve(root, file), 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${(error as Error).message}`);
  }
  return extractMessagesFromSource(file, text);
}

export function loadAllMessages(root = process.cwd()): ExtractedMessage[] {
  return MESSAGE_FILES.flatMap((file) => extractMessages(file, root));
}

export function numericTokens(message: string): string[] {
  return (message.match(/\d+(?:,\d{3})*(?:\.\d+)*/g) ?? []).map((t) => t.replace(/,/g, ''));
}

export function buildContractSnapshot(messages: ExtractedMessage[]): ContractSnapshot {
  const files: ContractSnapshot['files'] = {};
  for (const m of messages) {
    const entry = (files[m.file] ??= { codes: [], numbers: {} });
    const code = m.code ?? DYNAMIC_CODE;
    if (!entry.codes.includes(code)) entry.codes.push(code);
    (entry.numbers[code] ??= []).push(...numericTokens(m.message));
  }
  for (const file of Object.keys(files).sort()) {
    const entry = files[file];
    entry.codes.sort();
    for (const code of Object.keys(entry.numbers)) entry.numbers[code].sort();
  }
  const sorted: ContractSnapshot['files'] = {};
  for (const file of Object.keys(files).sort()) {
    const entry = files[file];
    sorted[file] = {
      codes: entry.codes,
      numbers: Object.fromEntries(entry.codes.map((c) => [c, entry.numbers[c] ?? []])),
    };
  }
  return { files: sorted };
}

/** Returns a list of violations; empty means current satisfies the baseline. */
export function compareToBaseline(current: ContractSnapshot, baseline: ContractSnapshot): string[] {
  const problems: string[] = [];
  for (const file of Object.keys(baseline.files)) {
    const base = baseline.files[file];
    const cur = current.files[file];
    if (!cur) {
      problems.push(`${file}: file missing from current extraction`);
      continue;
    }
    if (JSON.stringify(cur.codes) !== JSON.stringify(base.codes)) {
      const missing = base.codes.filter((c) => !cur.codes.includes(c));
      const added = cur.codes.filter((c) => !base.codes.includes(c));
      problems.push(`${file}: code set changed; missing [${missing}] added [${added}]`);
    }
    for (const code of base.codes) {
      const remaining = [...(cur.numbers[code] ?? [])];
      for (const token of base.numbers[code] ?? []) {
        const i = remaining.indexOf(token);
        if (i === -1) problems.push(`${file}: code ${code} lost numeric token ${token}`);
        else remaining.splice(i, 1);
      }
    }
  }
  return problems;
}

import * as fs from 'fs';

export interface GuidanceItem {
  name: string;
  description: string;
  path: string;
}

export function buildTableSection(
  title: string,
  subtitle: string,
  basePath: string,
  items: GuidanceItem[],
  pathFormatter: (item: GuidanceItem) => string,
): string {
  if (items.length === 0) return '';

  let section = `### ${title} (\`${basePath}/\`)\n\n`;
  section += `${subtitle}\n\n`;
  section += `| ${title.slice(0, -1)} | Description | Path |\n`;
  section += '|-------|-------------|------|\n';
  for (const item of items) {
    section += `| ${item.name} | ${item.description || '—'} | \`${pathFormatter(item)}\` |\n`;
  }
  section += '\n';
  return section;
}

export function buildSteeringSection(basePath: string, docs: string[]): string {
  if (docs.length === 0) return '';

  let section = `### Steering (\`${basePath}/\`)\n\n`;
  section += 'Project-specific context documents:\n\n';
  for (const doc of docs) {
    section += `- \`${basePath}/${doc}\`\n`;
  }
  section += '\n';
  return section;
}

export function buildGuidanceSection(title: string, basePath: string | undefined): string {
  if (!basePath) return '';
  return `### ${title} (\`${basePath}/\`)\n\nRead the relevant guidance files from this directory on demand.\n\n`;
}

export async function listMarkdownFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(directory);
    return entries.filter(file => file.endsWith('.md'));
  } catch {
    return [];
  }
}

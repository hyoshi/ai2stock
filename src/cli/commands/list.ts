import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import chalk from 'chalk';
import { loadConfig } from '../../core/config.js';
import { isValidAtomFrontmatter } from '../../core/frontmatter.js';
import type { AtomFrontmatter } from '../../core/types.js';

interface ListOptions {
  recent?: string;
  tag?: string;
  type?: string;
  project?: string;
}

interface AtomSummary {
  id: string;
  type: string;
  created: string;
  project?: string;
  tags?: string[];
  title: string;
  filePath: string;
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const cfg = loadConfig();
  const atomsDir = path.join(cfg.obsidian.vault_path, cfg.obsidian.folders.atoms);
  if (!fs.existsSync(atomsDir)) {
    console.log(chalk.yellow(`No atoms directory yet: ${atomsDir}`));
    return;
  }

  const files = fg.sync('**/*.md', { cwd: atomsDir, absolute: true });
  const summaries: AtomSummary[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = matter(raw);
      if (!isValidAtomFrontmatter(parsed.data)) continue;
      const fm: AtomFrontmatter = parsed.data;

      if (opts.tag && !(fm.tags || []).map((t) => String(t).toLowerCase()).includes(opts.tag.toLowerCase())) continue;
      if (opts.type && fm.type !== opts.type) continue;
      if (opts.project && fm.project !== opts.project) continue;

      const titleMatch = parsed.content.match(/^#+\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : fm.id;

      summaries.push({
        id: fm.id,
        type: fm.type,
        created: fm.created,
        project: fm.project,
        tags: fm.tags,
        title,
        filePath: file,
      });
    } catch {
      // skip
    }
  }

  summaries.sort((a, b) => (a.created < b.created ? 1 : -1));

  const limit = parseInt(opts.recent || '20', 10);
  const limited = summaries.slice(0, isNaN(limit) ? 20 : limit);

  if (limited.length === 0) {
    console.log(chalk.yellow('No atoms found matching the filter.'));
    return;
  }

  for (const s of limited) {
    const datePart = s.created.slice(0, 10);
    const tagPart = s.tags && s.tags.length > 0 ? chalk.gray(` #${s.tags.join(' #')}`) : '';
    const projPart = s.project ? chalk.gray(` (${s.project})`) : '';
    console.log(`${chalk.dim(datePart)} ${chalk.cyan('[' + s.type + ']')} ${s.title}${projPart}${tagPart}`);
    console.log(chalk.dim(`           ${s.id}`));
  }
  console.log(chalk.dim(`\n(${limited.length} of ${summaries.length} total)`));
}

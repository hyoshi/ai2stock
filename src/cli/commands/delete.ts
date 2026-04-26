import chalk from 'chalk';
import { loadConfig } from '../../core/config.js';
import { findAtomById, deleteAtomFile } from '../../adapters/obsidian/edit.js';
import { findNotionAtomById, archiveNotionAtom } from '../../adapters/notion/edit.js';
import { isInsideDir } from '../../core/fs-utils.js';

interface DeleteOptions {
  id?: string;
  force?: boolean;
  to?: string;
}

export async function deleteCommand(opts: DeleteOptions): Promise<void> {
  if (!opts.id) {
    throw new Error('--id <id> を指定してください');
  }

  const cfg = loadConfig();
  const targets = resolveTargets(opts.to, cfg);
  if (targets.length === 0) {
    throw new Error('No enabled adapters to delete from. Check config or --to flag.');
  }

  const wantsObsidian = targets.includes('obsidian');
  const wantsNotion = targets.includes('notion');

  let obsidianFound: ReturnType<typeof findAtomById> | null = null;
  let notionFound: Awaited<ReturnType<typeof findNotionAtomById>> | null = null;

  if (wantsObsidian) {
    obsidianFound = findAtomById(cfg.obsidian, opts.id);
    if (!obsidianFound) {
      console.warn(chalk.yellow(`! Obsidian: atom not found by id=${opts.id}`));
    } else if (!isInsideDir(obsidianFound.filePath, cfg.obsidian.vault_path)) {
      throw new Error(`Refusing to delete path outside vault: ${obsidianFound.filePath}`);
    }
  }

  if (wantsNotion) {
    if (!cfg.notion?.enabled) {
      throw new Error('notion adapter is not enabled in config');
    }
    notionFound = await findNotionAtomById(cfg.notion, opts.id);
    if (!notionFound) {
      console.warn(chalk.yellow(`! Notion: atom not found by id=${opts.id}`));
    }
  }

  if (!obsidianFound && !notionFound) {
    throw new Error(`Atom not found in any target by id: ${opts.id}`);
  }

  if (!opts.force) {
    console.log(chalk.yellow('削除対象 (--force で実行):'));
    if (obsidianFound) {
      console.log(chalk.yellow(`  Obsidian: ${obsidianFound.filePath}`));
      console.log(chalk.yellow(`    Title: ${obsidianFound.title}, Type: ${obsidianFound.frontmatter.type}`));
    }
    if (notionFound) {
      console.log(chalk.yellow(`  Notion:   ${notionFound.url}`));
    }
    console.log(chalk.dim('実行するには --force を付けて再実行してください'));
    return;
  }

  const failures: string[] = [];

  if (obsidianFound) {
    try {
      deleteAtomFile(obsidianFound.filePath);
      console.log(chalk.green(`✓ Obsidian 削除: ${obsidianFound.filePath}`));
    } catch (e) {
      failures.push(`obsidian: ${(e as Error).message}`);
    }
  }
  if (notionFound && cfg.notion) {
    try {
      await archiveNotionAtom(cfg.notion, notionFound.pageId);
      console.log(chalk.green(`✓ Notion archive: ${notionFound.url}`));
    } catch (e) {
      failures.push(`notion: ${(e as Error).message}`);
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error(chalk.red(`✗ ${f}`));
    process.exitCode = 1;
    if (targets.length === 1 || (failures.length === 1 && (obsidianFound ? 1 : 0) + (notionFound ? 1 : 0) === 1)) {
      throw new Error(failures[0]);
    }
  }
}

function resolveTargets(toFlag: string | undefined, cfg: ReturnType<typeof loadConfig>): string[] {
  if (toFlag) {
    if (toFlag === 'all') return ['obsidian', 'notion'];
    return toFlag.split(',').map((s) => s.trim()).filter(Boolean);
  }
  // For delete, default to primary adapter only (safer)
  return [cfg.defaults.primary_adapter ?? 'obsidian'];
}

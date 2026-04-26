import path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../core/config.js';
import { findAtomById, deleteAtomFile } from '../../adapters/obsidian/edit.js';

interface DeleteOptions {
  id?: string;
  force?: boolean;
}

export async function deleteCommand(opts: DeleteOptions): Promise<void> {
  if (!opts.id) {
    throw new Error('--id <id> を指定してください');
  }

  const cfg = loadConfig();
  const found = findAtomById(cfg.obsidian, opts.id);
  if (!found) {
    throw new Error(`Atom not found by id: ${opts.id}`);
  }

  const vaultRoot = path.resolve(cfg.obsidian.vault_path);
  const resolved = path.resolve(found.filePath);
  if (!resolved.startsWith(vaultRoot + path.sep)) {
    throw new Error(`Refusing to delete path outside vault: ${resolved}`);
  }

  if (!opts.force) {
    console.log(chalk.yellow(`削除対象: ${found.filePath}`));
    console.log(chalk.yellow(`  Title: ${found.title}`));
    console.log(chalk.yellow(`  Type:  ${found.frontmatter.type}`));
    console.log(chalk.red('実行するには --force を付けて再実行してください'));
    return;
  }

  deleteAtomFile(found.filePath);
  console.log(chalk.green(`✓ 削除: ${found.filePath}`));
}

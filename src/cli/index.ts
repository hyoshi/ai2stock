#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';

const program = new Command();

program
  .name('ai2stock')
  .description('Stock AI conversations as Atomic notes in your Obsidian Vault.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize ai2stock: configure vault, install slash command')
  .option('--vault <path>', 'Obsidian vault path (skip prompt)')
  .option('--no-slash', 'Skip installing /stock slash command')
  .option('--force', 'Overwrite existing config')
  .action(initCommand);

program
  .command('add')
  .description('Add an Atom from text input')
  .option('--from-stdin', 'Read content from stdin')
  .option('--type <type>', 'Force type (decision|snippet|learning|reference)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--project <name>', 'Project name')
  .option('--confidence <level>', 'high|medium|low')
  .option('--title <title>', 'Override title')
  .option('--dry-run', 'Show what would be written without writing')
  .option('--to <adapters>', 'Comma-separated adapters (default: all)')
  .option('--append', 'Append content to the most recent Atom (no ID needed)')
  .option('--replace', 'Replace body of the most recent Atom (no ID needed)')
  .option('--section', 'Replace one section (interactive picker) of the most recent Atom')
  .option('--pick', 'Use interactive picker to choose target Atom from recent list')
  .argument('[content]', 'Content text (omit if using --from-stdin)')
  .action(addCommand);

program
  .command('list')
  .description('List recent Atoms in the vault')
  .option('--recent <n>', 'Limit to N recent atoms', '20')
  .option('--tag <tag>', 'Filter by tag')
  .option('--type <type>', 'Filter by type')
  .option('--project <name>', 'Filter by project')
  .action(listCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

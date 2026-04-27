import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import prompts from 'prompts';
import {
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_PATH,
  configExists,
  saveConfig,
} from '../../core/config.js';
import type { Config, NotionConfig } from '../../core/types.js';

interface InitOptions {
  vault?: string;
  slash?: boolean;
  force?: boolean;
}

const COMMANDS_SOURCE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'commands',
);

export async function initCommand(opts: InitOptions): Promise<void> {
  console.log(chalk.bold.cyan('AI2Stock 初期設定\n'));

  if (configExists() && !opts.force) {
    console.log(
      chalk.yellow(`既に設定ファイルがあります: ${DEFAULT_CONFIG_PATH}`),
    );
    console.log(chalk.yellow('上書きする場合は --force を付けて再実行してください。\n'));
    return;
  }

  let vaultPath = opts.vault;
  if (!vaultPath) {
    const candidates = detectVaultCandidates();
    vaultPath = await promptVaultPath(candidates);
  }

  if (!vaultPath) {
    throw new Error('Vaultパスが指定されていません。中断します。');
  }

  vaultPath = path.resolve(vaultPath);
  if (!fs.existsSync(vaultPath)) {
    const { create } = await prompts({
      type: 'confirm',
      name: 'create',
      message: `Vaultディレクトリが存在しません: ${vaultPath}\n作成しますか?`,
      initial: true,
    });
    if (!create) {
      throw new Error('Vault作成がキャンセルされました。中断します。');
    }
    fs.mkdirSync(vaultPath, { recursive: true });
  }

  const project = await promptProject();
  const notionCfg = await promptNotionOptional();

  const cfg: Config = {
    ...DEFAULT_CONFIG,
    obsidian: {
      ...DEFAULT_CONFIG.obsidian,
      vault_path: vaultPath,
    },
    defaults: {
      ...DEFAULT_CONFIG.defaults,
      default_project: project || undefined,
    },
  };
  if (notionCfg) {
    cfg.notion = notionCfg;
    cfg.adapters = ['obsidian', 'notion'];
  }

  saveConfig(cfg);
  console.log(chalk.green(`✓ 設定保存: ${DEFAULT_CONFIG_PATH}`));

  createVaultStructure(cfg);
  console.log(chalk.green('✓ Vaultフォルダ構造作成完了'));

  if (opts.slash !== false) {
    installSlashCommand();
  }

  console.log(chalk.bold.green('\n完了！'));
  console.log('Claude Code セッションで ' + chalk.cyan('/stock') + ' を試してください。');
  console.log('プレビューだけ見たい場合は ' + chalk.cyan('/stock --dry-run') + '。');
}

function detectVaultCandidates(): string[] {
  const home = os.homedir();
  const seeds = [
    path.join(home, 'Documents', 'ObsidianVault'),
    path.join(home, 'Documents', 'Obsidian'),
    path.join(home, 'Obsidian'),
    path.join(
      home,
      'Library',
      'Mobile Documents',
      'iCloud~md~obsidian',
      'Documents',
    ),
  ];

  return seeds.filter((p) => {
    try {
      const stat = fs.statSync(p);
      return stat.isDirectory();
    } catch {
      return false;
    }
  });
}

async function promptVaultPath(candidates: string[]): Promise<string | undefined> {
  const choices = [
    ...candidates.map((c) => ({ title: c, value: c })),
    { title: '手動でパス入力', value: '__manual__' },
  ];

  const { selected } = await prompts({
    type: 'select',
    name: 'selected',
    message: 'Obsidian Vault のパスを指定してください',
    choices,
  });

  if (selected === '__manual__' || !selected) {
    const { manual } = await prompts({
      type: 'text',
      name: 'manual',
      message: 'Vault のフルパスを入力してください',
      validate: (v) => (v && v.length > 0 ? true : '空白は無効です'),
    });
    return manual;
  }
  return selected as string;
}

async function promptProject(): Promise<string | null> {
  const { project } = await prompts({
    type: 'text',
    name: 'project',
    message: 'デフォルトのプロジェクト名 (任意、Enterでスキップ)',
  });
  return project || null;
}

async function promptNotionOptional(): Promise<NotionConfig | null> {
  const { enable } = await prompts({
    type: 'confirm',
    name: 'enable',
    message: 'Notion アダプタも有効にしますか? (sidebar に各atomがファイルとして並ぶ)',
    initial: false,
  });
  if (!enable) return null;

  console.log(chalk.cyan('\nNotion セットアップ手順:'));
  console.log('  1. https://www.notion.so/my-integrations で Integration 作成 → Token 取得');
  console.log('  2. (任意) 親ページを使う場合: 親ページに Integration を connect');
  console.log('     使わない場合: 各セッション名と同じタイトルの top-level ページを Notion で個別に作成し、それぞれに Integration を connect');
  console.log('  3. ページ右上 ... → Connections → 作成した Integration を connect\n');

  const { tokenEnv } = await prompts({
    type: 'text',
    name: 'tokenEnv',
    message: 'Token を保存する環境変数名 (default: NOTION_TOKEN)',
    initial: 'NOTION_TOKEN',
  });
  const { parentPageId } = await prompts({
    type: 'text',
    name: 'parentPageId',
    message: 'Notion Parent Page ID（任意・Enterでスキップ → セッション名ページを workspace 直下に配置）',
  });

  if (!process.env[tokenEnv]) {
    console.log(chalk.yellow(`\n! ${tokenEnv} が現在の環境にありません。`));
    console.log(chalk.yellow(`  シェル設定 (~/.bash_profile / ~/.zshrc 等) に export ${tokenEnv}=secret_xxx を追記してください。`));
    console.log(chalk.yellow('  追記後シェル再起動 or source で反映してから ai2stock を使ってください。'));
  }

  const cfg: NotionConfig = {
    enabled: true,
    token_env: tokenEnv || 'NOTION_TOKEN',
  };
  if (parentPageId && parentPageId.trim()) {
    cfg.parent_page_id = parentPageId.trim();
  }
  return cfg;
}

function createVaultStructure(cfg: Config): void {
  const vault = cfg.obsidian.vault_path;
  const dirs = [
    path.join(vault, cfg.obsidian.folders.moc),
    path.join(vault, cfg.obsidian.folders.moc, 'projects'),
    path.join(vault, cfg.obsidian.folders.atoms, 'decisions'),
    path.join(vault, cfg.obsidian.folders.atoms, 'snippets'),
    path.join(vault, cfg.obsidian.folders.atoms, 'learnings'),
    path.join(vault, cfg.obsidian.folders.atoms, 'references'),
    path.join(vault, cfg.obsidian.folders.sessions),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function installSlashCommand(): void {
  const targetDir = path.join(os.homedir(), '.claude', 'commands');
  fs.mkdirSync(targetDir, { recursive: true });

  const sourceFile = path.join(COMMANDS_SOURCE, 'stock.md');
  const targetFile = path.join(targetDir, 'stock.md');

  if (!fs.existsSync(sourceFile)) {
    console.log(
      chalk.yellow(`! slash command source not found at ${sourceFile} — skipped`),
    );
    return;
  }

  if (fs.existsSync(targetFile)) {
    console.log(chalk.yellow(`! ${targetFile} already exists — skipped`));
    return;
  }

  fs.copyFileSync(sourceFile, targetFile);
  console.log(chalk.green(`✓ /stock コマンドを ${targetFile} にインストール`));
}

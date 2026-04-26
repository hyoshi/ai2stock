import chalk from 'chalk';
import prompts from 'prompts';
import { loadConfig } from '../../core/config.js';
import { isInsideDir } from '../../core/fs-utils.js';
import { buildAtomFromInput } from '../../core/intermediate.js';
import { writeAtomToVault } from '../../adapters/obsidian/write.js';
import { findRelatedAtoms, insertBacklinks } from '../../adapters/obsidian/backlink.js';
import { updateProjectMoc } from '../../adapters/obsidian/moc.js';
import { writeAtomToNotion } from '../../adapters/notion/write.js';
import {
  appendToAtom,
  replaceAtomBody,
  replaceSection,
  listSections,
  findAtomById,
} from '../../adapters/obsidian/edit.js';
import { serializeAtom } from '../../core/frontmatter.js';
import { getLastAdded, getRecentList, recordAdd } from '../../core/recent.js';
import type { AtomType, Confidence, Atom } from '../../core/types.js';

interface AddOptions {
  fromStdin?: boolean;
  type?: string;
  tags?: string;
  project?: string;
  confidence?: string;
  title?: string;
  dryRun?: boolean;
  to?: string;
  append?: boolean;
  replace?: boolean;
  section?: boolean;
  pick?: boolean;
  id?: string;
}

const VALID_TYPES = new Set<AtomType>(['decision', 'snippet', 'learning', 'reference']);
const VALID_CONFIDENCE = new Set<Confidence>(['high', 'medium', 'low']);

export async function addCommand(content: string | undefined, opts: AddOptions): Promise<void> {
  const cfg = loadConfig();

  let body = content || '';
  if (opts.fromStdin || !body) {
    body = await readStdin();
  }
  body = body.trim();
  if (!body) {
    throw new Error('内容が空です。引数または --from-stdin で渡してください。');
  }

  validateOpts(opts);

  if (opts.append || opts.replace || opts.section) {
    await handleEditMode(body, opts, cfg);
    return;
  }

  if (opts.pick) {
    throw new Error('--pick は --append / --replace / --section のいずれかと組み合わせてください');
  }

  await handleNewAtom(body, opts, cfg);
}

function validateOpts(opts: AddOptions): void {
  if (opts.type && !VALID_TYPES.has(opts.type as AtomType)) {
    throw new Error(`Invalid --type: ${opts.type}. Must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
  if (opts.confidence && !VALID_CONFIDENCE.has(opts.confidence as Confidence)) {
    throw new Error(`Invalid --confidence: ${opts.confidence}. Must be one of: high, medium, low`);
  }
  if (opts.project && /\.\.|[/\\]/.test(opts.project)) {
    throw new Error(`Invalid --project: ${opts.project}. Path separators and '..' are not allowed.`);
  }
  const editFlags = [opts.append, opts.replace, opts.section].filter(Boolean).length;
  if (editFlags > 1) {
    throw new Error('--append, --replace, --section は同時指定できません');
  }
}

async function handleNewAtom(body: string, opts: AddOptions, cfg: ReturnType<typeof loadConfig>): Promise<void> {
  const type = opts.type ? (opts.type as AtomType) : undefined;
  const confidence = opts.confidence ? (opts.confidence as Confidence) : undefined;
  const tags = opts.tags ? opts.tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const atom = buildAtomFromInput({
    content: body,
    type,
    tags,
    project: opts.project,
    confidence,
    title: opts.title,
    defaults: {
      source: cfg.defaults.source,
      confidence: cfg.defaults.confidence,
      defaultProject: cfg.defaults.default_project,
    },
  });

  if (opts.dryRun) {
    console.log(chalk.bold.cyan('--- DRY RUN ---'));
    console.log(serializeAtom(atom.frontmatter, atom.body));
    console.log(chalk.bold.cyan('--- (not saved) ---'));
    return;
  }

  const targets = resolveAdapterTargets(opts.to, cfg);
  if (targets.length === 0) {
    throw new Error('No enabled adapters to write to. Check config or --to flag.');
  }

  let firstObsidianResult: { filePath: string; relativePath: string } | null = null;
  let related: Array<{ frontmatter: { id: string } }> = [];
  let mocUpdated = false;
  const notionResults: Array<{ pageId: string; url: string }> = [];

  for (const target of targets) {
    if (target === 'obsidian') {
      if (!cfg.obsidian.enabled) continue;
      const found = findRelatedAtoms(atom.frontmatter.tags || [], cfg.obsidian, atom.frontmatter.id, 10);
      related = found;
      const result = writeAtomToVault(atom, cfg.obsidian, {
        related: found.map((r) => r.frontmatter.id),
      });
      firstObsidianResult = { filePath: result.filePath, relativePath: result.relativePath };
      if (found.length > 0) insertBacklinks(found, atom.frontmatter.id);
      mocUpdated = updateProjectMoc(atom, cfg.obsidian);
    } else if (target === 'notion') {
      if (!cfg.notion?.enabled) {
        console.warn(chalk.yellow('! notion target requested but adapter is disabled in config'));
        continue;
      }
      try {
        const r = await writeAtomToNotion(atom, cfg.notion);
        notionResults.push(r);
      } catch (e) {
        console.error(chalk.red(`✗ notion write failed: ${(e as Error).message}`));
      }
    }
  }

  if (firstObsidianResult) {
    recordAdd({
      id: atom.frontmatter.id,
      filePath: firstObsidianResult.filePath,
      type: atom.frontmatter.type,
      title: atom.title,
      project: atom.frontmatter.project,
      tags: atom.frontmatter.tags,
      created: atom.frontmatter.created,
    });
  }

  printSaveSummary(firstObsidianResult, atom, related, mocUpdated, notionResults);
}

function resolveAdapterTargets(toFlag: string | undefined, cfg: ReturnType<typeof loadConfig>): string[] {
  if (toFlag) {
    if (toFlag === 'all') return ['obsidian', 'notion'];
    return toFlag.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const strategy = cfg.defaults.write_strategy ?? 'primary_only';
  const primary = cfg.defaults.primary_adapter ?? 'obsidian';
  if (strategy === 'all') return ['obsidian', 'notion'];
  if (strategy === 'sequential') return ['obsidian', 'notion'];
  return [primary];
}

async function handleEditMode(body: string, opts: AddOptions, cfg: ReturnType<typeof loadConfig>): Promise<void> {
  const target = await resolveTarget(opts, cfg);
  if (!target) {
    throw new Error('対象Atomが見つかりません。--id 指定 or 先に /stock で新規Atom作成してください。');
  }

  if (!isInsideDir(target.filePath, cfg.obsidian.vault_path)) {
    throw new Error(`Refusing to edit path outside vault: ${target.filePath}`);
  }

  if (opts.dryRun) {
    console.log(chalk.bold.cyan(`--- DRY RUN: ${describeMode(opts)} ---`));
    console.log(chalk.dim(`Target: ${target.filePath}`));
    console.log(body);
    console.log(chalk.bold.cyan('--- (not saved) ---'));
    return;
  }

  if (opts.append) {
    appendToAtom(target.filePath, body);
    console.log(chalk.green(`✓ 追記: ${target.filePath}`));
    console.log(`  Title: ${target.title}`);
    return;
  }

  if (opts.replace) {
    replaceAtomBody(target.filePath, body);
    console.log(chalk.green(`✓ 置換: ${target.filePath}`));
    console.log(`  Title: ${target.title}`);
    return;
  }

  if (opts.section) {
    const sections = listSections(target.filePath);
    if (sections.length === 0) {
      throw new Error('対象Atomに ## 見出しがありません。--replace を使ってください。');
    }
    const { selected } = await prompts({
      type: 'select',
      name: 'selected',
      message: '更新するsectionを選択',
      choices: sections.map((s) => ({ title: s, value: s })),
    });
    if (!selected) {
      throw new Error('sectionが選択されませんでした');
    }
    replaceSection(target.filePath, selected, body);
    console.log(chalk.green(`✓ Section置換: ${target.filePath}`));
    console.log(`  Section: ${selected}`);
    return;
  }
}

async function resolveTarget(opts: AddOptions, cfg: ReturnType<typeof loadConfig>): Promise<{ filePath: string; title: string; id: string } | null> {
  if (opts.id) {
    const found = findAtomById(cfg.obsidian, opts.id);
    if (!found) {
      throw new Error(`Atom not found by id: ${opts.id}`);
    }
    return { filePath: found.filePath, title: found.title, id: found.frontmatter.id };
  }

  if (opts.pick) {
    const list = getRecentList(10);
    if (list.length === 0) return null;
    const { selected } = await prompts({
      type: 'select',
      name: 'selected',
      message: '対象Atomを選択',
      choices: list.map((e) => ({
        title: `[${e.type}] ${e.title}${e.project ? ' (' + e.project + ')' : ''}`,
        value: e.id,
      })),
    });
    if (!selected) return null;
    const entry = list.find((e) => e.id === selected);
    return entry ? { filePath: entry.filePath, title: entry.title, id: entry.id } : null;
  }

  const last = getLastAdded();
  if (!last) return null;
  return { filePath: last.filePath, title: last.title, id: last.id };
}

function describeMode(opts: AddOptions): string {
  if (opts.append) return 'APPEND';
  if (opts.replace) return 'REPLACE';
  if (opts.section) return 'SECTION REPLACE';
  return 'NEW';
}

function printSaveSummary(
  obsidianResult: { relativePath: string } | null,
  atom: Atom,
  related: Array<{ frontmatter: { id: string } }>,
  mocUpdated: boolean,
  notionResults: Array<{ pageId: string; url: string }>,
): void {
  if (obsidianResult) {
    console.log(chalk.green(`✓ Obsidian: ${obsidianResult.relativePath}`));
  }
  for (const n of notionResults) {
    console.log(chalk.green(`✓ Notion:   ${n.url}`));
  }
  console.log(`  Type: ${atom.frontmatter.type}`);
  if (atom.frontmatter.tags && atom.frontmatter.tags.length > 0) {
    console.log(`  Tags: ${atom.frontmatter.tags.join(', ')}`);
  }
  if (related.length > 0) {
    console.log(`  Related (backlinked): ${related.map((r) => r.frontmatter.id).join(', ')}`);
  }
  if (mocUpdated && atom.frontmatter.project) {
    console.log(`  MOC updated: ${atom.frontmatter.project}`);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}

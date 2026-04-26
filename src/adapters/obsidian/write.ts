import fs from 'node:fs';
import path from 'node:path';
import type { Atom, AtomType, ObsidianConfig, WriteResult } from '../../core/types.js';
import { serializeAtom } from '../../core/frontmatter.js';

const TYPE_TO_SUBFOLDER: Record<AtomType, string> = {
  decision: 'decisions',
  snippet: 'snippets',
  learning: 'learnings',
  reference: 'references',
};

export interface WriteAtomOptions {
  related?: string[];
  mocUpdated?: boolean;
}

export function writeAtomToVault(
  atom: Atom,
  cfg: ObsidianConfig,
  opts: WriteAtomOptions = {},
): WriteResult {
  if (!cfg.vault_path) {
    throw new Error('Obsidian vault_path is not configured');
  }
  if (!fs.existsSync(cfg.vault_path)) {
    throw new Error(`Vault path does not exist: ${cfg.vault_path}`);
  }

  const subfolder = TYPE_TO_SUBFOLDER[atom.frontmatter.type];
  const dir = path.join(cfg.vault_path, cfg.folders.atoms, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = pickAvailablePath(dir, atom.frontmatter.id);

  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    throw new Error(`Refusing to write atom outside its type folder: ${atom.frontmatter.id}`);
  }

  const text = serializeAtom(atom.frontmatter, atom.body);
  try {
    fs.writeFileSync(filePath, text, 'utf8');
  } catch (e) {
    throw new Error(`Failed to write atom to ${filePath}: ${(e as Error).message}`);
  }

  return {
    filePath,
    relativePath: path.relative(cfg.vault_path, filePath),
    related: opts.related ?? [],
    mocUpdated: opts.mocUpdated ?? false,
  };
}

function pickAvailablePath(dir: string, id: string): string {
  const baseName = sanitizeFileName(id);
  const candidate = path.join(dir, `${baseName}.md`);
  if (!fs.existsSync(candidate)) return candidate;

  for (let i = 2; i < 100; i++) {
    const next = path.join(dir, `${baseName}-${i}.md`);
    if (!fs.existsSync(next)) return next;
  }
  return path.join(dir, `${baseName}-${Date.now()}.md`);
}

function sanitizeFileName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '-').slice(0, 100);
}

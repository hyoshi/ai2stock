import fs from 'node:fs';
import path from 'node:path';
import type { Atom, ObsidianConfig, WriteResult } from '../../core/types.js';
import { serializeAtom } from '../../core/frontmatter.js';
import { sanitizeSessionName } from '../../core/session.js';
import { writeFileAtomic, isInsideDir } from '../../core/fs-utils.js';

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

  const sessionFolder = sanitizeSessionName(atom.frontmatter.session_name || 'untitled-session');
  const dir = path.join(cfg.vault_path, cfg.folders.atoms, sessionFolder);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = pickAvailablePath(dir, atom.frontmatter.id);

  if (!isInsideDir(filePath, dir)) {
    throw new Error(`Refusing to write atom outside its session folder: ${atom.frontmatter.id}`);
  }

  const text = serializeAtom(atom.frontmatter, atom.body);
  writeFileAtomic(filePath, text);

  return {
    filePath,
    relativePath: path.relative(cfg.vault_path, filePath),
    related: opts.related ?? [],
    mocUpdated: opts.mocUpdated ?? false,
  };
}

function pickAvailablePath(dir: string, id: string): string {
  const baseName = sanitizeFileName(id);
  const candidates = [
    path.join(dir, `${baseName}.md`),
    ...Array.from({ length: 98 }, (_, i) => path.join(dir, `${baseName}-${i + 2}.md`)),
  ];
  for (const candidate of candidates) {
    if (tryAtomicReserve(candidate)) return candidate;
  }
  const fallback = path.join(dir, `${baseName}-${Date.now()}-${process.pid}.md`);
  if (tryAtomicReserve(fallback)) return fallback;
  throw new Error(`Could not reserve unique path for atom: ${baseName}`);
}

function tryAtomicReserve(candidate: string): boolean {
  try {
    const fd = fs.openSync(candidate, 'wx');
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}

function sanitizeFileName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '-').slice(0, 100);
}

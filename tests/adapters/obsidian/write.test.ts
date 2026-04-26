import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeAtomToVault } from '../../../src/adapters/obsidian/write.js';
import type { Atom, ObsidianConfig } from '../../../src/core/types.js';

let tmpVault: string;
let cfg: ObsidianConfig;

beforeEach(() => {
  tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ai2stock-vault-'));
  cfg = {
    enabled: true,
    vault_path: tmpVault,
    folders: { atoms: '10-Atoms', sessions: '20-Sessions', moc: '00-MOC' },
  };
});

afterEach(() => {
  fs.rmSync(tmpVault, { recursive: true, force: true });
});

function makeAtom(overrides: Partial<Atom['frontmatter']> = {}, body = '# Test\n\nbody'): Atom {
  return {
    frontmatter: {
      id: '2026-04-23-1000-test-atom',
      type: 'decision',
      created: '2026-04-23T10:00:00+09:00',
      'ai-generated': true,
      tags: ['oss', 'test'],
      project: 'ai2stock',
      ...overrides,
    },
    title: 'Test Atom',
    body,
  };
}

describe('writeAtomToVault', () => {
  it('writes atom into the correct type folder', () => {
    const atom = makeAtom({ type: 'snippet' });
    const result = writeAtomToVault(atom, cfg);
    expect(result.filePath).toContain(path.join('10-Atoms', 'snippets'));
    expect(result.filePath.endsWith('.md')).toBe(true);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('creates folder structure if missing', () => {
    const atom = makeAtom({ type: 'learning' });
    writeAtomToVault(atom, cfg);
    expect(fs.existsSync(path.join(tmpVault, '10-Atoms', 'learnings'))).toBe(true);
  });

  it('writes valid frontmatter and body', () => {
    const atom = makeAtom({}, '# Heading\n\nBody content');
    const result = writeAtomToVault(atom, cfg);
    const content = fs.readFileSync(result.filePath, 'utf8');
    expect(content).toMatch(/^---/);
    expect(content).toContain('id: 2026-04-23-1000-test-atom');
    expect(content).toContain('type: decision');
    expect(content).toContain('Body content');
  });

  it('uses id as filename', () => {
    const atom = makeAtom();
    const result = writeAtomToVault(atom, cfg);
    expect(path.basename(result.filePath)).toBe('2026-04-23-1000-test-atom.md');
  });

  it('does not overwrite existing files (appends suffix)', () => {
    const atom = makeAtom();
    const r1 = writeAtomToVault(atom, cfg);
    const r2 = writeAtomToVault(atom, cfg);
    expect(r1.filePath).not.toBe(r2.filePath);
    expect(fs.existsSync(r1.filePath)).toBe(true);
    expect(fs.existsSync(r2.filePath)).toBe(true);
  });
});

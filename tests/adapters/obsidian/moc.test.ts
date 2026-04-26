import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { updateProjectMoc } from '../../../src/adapters/obsidian/moc.js';
import type { Atom, ObsidianConfig } from '../../../src/core/types.js';

let tmpVault: string;
let cfg: ObsidianConfig;

beforeEach(() => {
  tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ai2stock-moc-'));
  cfg = {
    enabled: true,
    vault_path: tmpVault,
    folders: { atoms: '10-Atoms', sessions: '20-Sessions', moc: '00-MOC' },
  };
});

afterEach(() => {
  fs.rmSync(tmpVault, { recursive: true, force: true });
});

function makeAtom(overrides: Partial<Atom['frontmatter']> = {}): Atom {
  return {
    frontmatter: {
      id: '2026-04-23-1000-x',
      type: 'decision',
      created: '2026-04-23T10:00:00+09:00',
      'ai-generated': true,
      project: 'ai2stock',
      ...overrides,
    },
    title: 'Test',
    body: '# Test\n\nbody',
  };
}

describe('updateProjectMoc', () => {
  it('creates MOC file when missing', () => {
    const atom = makeAtom();
    updateProjectMoc(atom, cfg);
    const mocPath = path.join(tmpVault, '00-MOC', 'projects', 'ai2stock.md');
    expect(fs.existsSync(mocPath)).toBe(true);
  });

  it('appends entry to existing MOC', () => {
    updateProjectMoc(makeAtom({ id: 'a' }), cfg);
    updateProjectMoc(makeAtom({ id: 'b' }), cfg);
    const content = fs.readFileSync(path.join(tmpVault, '00-MOC', 'projects', 'ai2stock.md'), 'utf8');
    expect(content).toContain('[[a]]');
    expect(content).toContain('[[b]]');
  });

  it('does not duplicate entries', () => {
    updateProjectMoc(makeAtom({ id: 'a' }), cfg);
    updateProjectMoc(makeAtom({ id: 'a' }), cfg);
    const content = fs.readFileSync(path.join(tmpVault, '00-MOC', 'projects', 'ai2stock.md'), 'utf8');
    const occurrences = (content.match(/\[\[a\]\]/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('returns false when atom has no project', () => {
    const result = updateProjectMoc(makeAtom({ project: undefined }), cfg);
    expect(result).toBe(false);
  });
});

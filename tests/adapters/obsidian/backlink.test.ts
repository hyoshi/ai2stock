import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findRelatedAtoms, insertBacklinks } from '../../../src/adapters/obsidian/backlink.js';
import type { ObsidianConfig } from '../../../src/core/types.js';

let tmpVault: string;
let cfg: ObsidianConfig;

beforeEach(() => {
  tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'ai2stock-backlink-'));
  cfg = {
    enabled: true,
    vault_path: tmpVault,
    folders: { atoms: '10-Atoms', sessions: '20-Sessions', moc: '00-MOC' },
  };
});

afterEach(() => {
  fs.rmSync(tmpVault, { recursive: true, force: true });
});

function writeAtom(relativePath: string, frontmatter: Record<string, unknown>, body = '# Body\n\ntext'): string {
  const full = path.join(tmpVault, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const fmYaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${v}`;
    })
    .join('\n');
  fs.writeFileSync(full, `---\n${fmYaml}\n---\n\n${body}`, 'utf8');
  return full;
}

describe('findRelatedAtoms', () => {
  it('finds atoms sharing at least one tag', () => {
    writeAtom('10-Atoms/decisions/a.md', { id: 'a', type: 'decision', tags: ['oss', 'naming'] });
    writeAtom('10-Atoms/learnings/b.md', { id: 'b', type: 'learning', tags: ['naming'] });
    writeAtom('10-Atoms/snippets/c.md', { id: 'c', type: 'snippet', tags: ['unrelated'] });

    const related = findRelatedAtoms(['naming'], cfg, 'newatom');
    const ids = related.map((r) => r.frontmatter.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('c');
  });

  it('excludes the new atom itself', () => {
    writeAtom('10-Atoms/decisions/me.md', { id: 'me', type: 'decision', tags: ['x'] });
    const related = findRelatedAtoms(['x'], cfg, 'me');
    expect(related.find((r) => r.frontmatter.id === 'me')).toBeUndefined();
  });

  it('returns empty array when no tags provided', () => {
    writeAtom('10-Atoms/decisions/a.md', { id: 'a', type: 'decision', tags: ['x'] });
    expect(findRelatedAtoms([], cfg, 'newatom')).toEqual([]);
  });

  it('limits results', () => {
    for (let i = 0; i < 30; i++) {
      writeAtom(`10-Atoms/decisions/n${i}.md`, { id: `n${i}`, type: 'decision', tags: ['x'] });
    }
    const related = findRelatedAtoms(['x'], cfg, 'new', 10);
    expect(related.length).toBeLessThanOrEqual(10);
  });
});

describe('insertBacklinks', () => {
  it('appends Related section to each related atom', () => {
    const aPath = writeAtom(
      '10-Atoms/decisions/a.md',
      { id: 'a', type: 'decision', tags: ['x'] },
      '# A\n\nbody of a',
    );
    insertBacklinks([{ filePath: aPath, frontmatter: { id: 'a' } as never }], 'new-atom-id');

    const updated = fs.readFileSync(aPath, 'utf8');
    expect(updated).toContain('Related');
    expect(updated).toContain('[[new-atom-id]]');
  });

  it('does not duplicate backlinks if already present', () => {
    const aPath = writeAtom(
      '10-Atoms/decisions/a.md',
      { id: 'a', type: 'decision', tags: ['x'] },
      '# A\n\nbody\n\n## Related\n\n- [[existing]]',
    );
    insertBacklinks([{ filePath: aPath, frontmatter: { id: 'a' } as never }], 'existing');
    const content = fs.readFileSync(aPath, 'utf8');
    const occurrences = (content.match(/\[\[existing\]\]/g) || []).length;
    expect(occurrences).toBe(1);
  });
});

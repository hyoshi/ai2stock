import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { appendToAtom, replaceAtomBody, replaceSection, listSections } from '../../../src/adapters/obsidian/edit.js';

let tmpFile: string;

beforeEach(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai2stock-edit-'));
  tmpFile = path.join(tmpDir, 'atom.md');
});

afterEach(() => {
  try { fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true }); } catch {}
});

function writeAtomFile(body: string, fmExtra: Record<string, unknown> = {}) {
  const fmEntries = Object.entries({
    id: '2026-04-26-1000-x',
    type: 'decision',
    created: '2026-04-26T10:00:00+09:00',
    'ai-generated': true,
    ...fmExtra,
  });
  const fm = fmEntries
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${v}`;
    })
    .join('\n');
  fs.writeFileSync(tmpFile, `---\n${fm}\n---\n\n${body}`, 'utf8');
}

describe('appendToAtom', () => {
  it('appends new section to body', () => {
    writeAtomFile('# Original\n\nFirst part.');
    appendToAtom(tmpFile, '追加情報の本文', new Date('2026-04-26T11:00:00+09:00'));
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toContain('First part.');
    expect(content).toContain('## 2026-04-26 11:00 追記');
    expect(content).toContain('追加情報の本文');
  });

  it('updates frontmatter updated field', () => {
    writeAtomFile('# Original\n\nbody');
    appendToAtom(tmpFile, 'more', new Date('2026-04-26T11:00:00+09:00'));
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toMatch(/updated:/);
  });

  it('preserves existing frontmatter fields', () => {
    writeAtomFile('# Original\n\nbody', { project: 'ai2stock', tags: ['x'] });
    appendToAtom(tmpFile, 'more', new Date());
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toMatch(/project:\s*ai2stock/);
  });
});

describe('replaceAtomBody', () => {
  it('replaces body entirely while preserving frontmatter', () => {
    writeAtomFile('# Original\n\nold body content');
    replaceAtomBody(tmpFile, '# New\n\ncompletely new body', new Date('2026-04-26T11:00:00+09:00'));
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).not.toContain('old body content');
    expect(content).toContain('completely new body');
    expect(content).toContain('id: 2026-04-26-1000-x');
  });

  it('updates updated field', () => {
    writeAtomFile('body');
    replaceAtomBody(tmpFile, 'new body', new Date('2026-04-26T11:00:00+09:00'));
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toMatch(/updated:/);
  });
});

describe('listSections', () => {
  it('extracts H2 headings from body', () => {
    writeAtomFile('# Title\n\n## Section A\n\ncontent\n\n## Section B\n\ncontent');
    const sections = listSections(tmpFile);
    expect(sections).toContain('Section A');
    expect(sections).toContain('Section B');
  });

  it('returns empty array when no H2 headings', () => {
    writeAtomFile('# Title only\n\ntext without subheadings');
    expect(listSections(tmpFile)).toEqual([]);
  });
});

describe('replaceSection', () => {
  it('replaces only the targeted section', () => {
    writeAtomFile('# Title\n\n## Section A\n\nold A\n\n## Section B\n\nB content');
    replaceSection(tmpFile, 'Section A', 'new A content', new Date());
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).not.toContain('old A');
    expect(content).toContain('new A content');
    expect(content).toContain('B content');
  });

  it('throws when section not found', () => {
    writeAtomFile('# Title\n\n## Section A\n\ncontent');
    expect(() => replaceSection(tmpFile, 'Nonexistent', 'x', new Date())).toThrow(/not found/i);
  });

  it('updates updated field', () => {
    writeAtomFile('## Section A\n\ncontent');
    replaceSection(tmpFile, 'Section A', 'new', new Date('2026-04-26T11:00:00+09:00'));
    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toMatch(/updated:/);
  });
});

import { describe, it, expect } from 'vitest';
import { buildFrontmatter, serializeAtom, parseAtom, generateId } from '../../src/core/frontmatter.js';
import type { AtomFrontmatter } from '../../src/core/types.js';

describe('generateId', () => {
  it('produces id with date prefix and slug', () => {
    const id = generateId('Test Title For ID', new Date('2026-04-23T10:30:00+09:00'));
    expect(id).toMatch(/^2026-04-23-\d{4}-test-title-for-id$/);
  });

  it('preserves Japanese characters mixed with ASCII', () => {
    const id = generateId('日本語タイトル test', new Date('2026-04-23T10:00:00+09:00'));
    expect(id).toMatch(/^2026-04-23-\d{4}-日本語タイトル-test$/);
  });

  it('preserves Japanese-only titles', () => {
    const id = generateId('経営会議のメモ', new Date('2026-04-23T10:00:00+09:00'));
    expect(id).toMatch(/^2026-04-23-\d{4}-経営会議のメモ$/);
  });

  it('strips filesystem-unsafe characters', () => {
    const id = generateId('path/to:file?name', new Date('2026-04-23T10:00:00+09:00'));
    expect(id).toMatch(/^2026-04-23-\d{4}-pathtofilename$/);
  });

  it('truncates long titles', () => {
    const id = generateId('a'.repeat(200), new Date('2026-04-23T10:00:00+09:00'));
    expect(id.length).toBeLessThanOrEqual(80);
  });

  it('falls back to untitled when title is empty', () => {
    const id = generateId('', new Date('2026-04-23T10:00:00+09:00'));
    expect(id).toMatch(/^2026-04-23-\d{4}-untitled$/);
  });

  it('falls back to untitled when title is whitespace only', () => {
    const id = generateId('   ', new Date('2026-04-23T10:00:00+09:00'));
    expect(id).toMatch(/^2026-04-23-\d{4}-untitled$/);
  });
});

describe('buildFrontmatter', () => {
  it('builds with required fields', () => {
    const fm = buildFrontmatter({
      title: 'Test Atom',
      type: 'decision',
      content: 'body',
      now: new Date('2026-04-23T10:00:00+09:00'),
    });
    expect(fm.id).toMatch(/^2026-04-23-/);
    expect(fm.type).toBe('decision');
    expect(fm.created).toMatch(/^2026-04-23T/);
    expect(fm['ai-generated']).toBe(true);
  });

  it('respects provided tags', () => {
    const fm = buildFrontmatter({
      title: 'X',
      type: 'snippet',
      content: 'body',
      tags: ['oss', 'naming'],
      now: new Date(),
    });
    expect(fm.tags).toContain('oss');
    expect(fm.tags).toContain('naming');
  });

  it('includes project, source, session, confidence when provided', () => {
    const fm = buildFrontmatter({
      title: 'X',
      type: 'learning',
      content: 'body',
      project: 'ai2stock',
      source: 'claude-code',
      session: 'sess-1',
      confidence: 'high',
      now: new Date(),
    });
    expect(fm.project).toBe('ai2stock');
    expect(fm.source).toBe('claude-code');
    expect(fm.session).toBe('sess-1');
    expect(fm.confidence).toBe('high');
  });
});

describe('serializeAtom / parseAtom', () => {
  it('roundtrips frontmatter and body', () => {
    const fm: AtomFrontmatter = {
      id: '2026-04-23-1000-test',
      type: 'decision',
      created: '2026-04-23T10:00:00+09:00',
      'ai-generated': true,
      tags: ['x', 'y'],
      project: 'p',
    };
    const body = '# Title\n\nThis is the body.';
    const text = serializeAtom(fm, body);
    expect(text.startsWith('---\n')).toBe(true);

    const parsed = parseAtom(text);
    expect(parsed.frontmatter.id).toBe(fm.id);
    expect(parsed.frontmatter.type).toBe(fm.type);
    expect(parsed.frontmatter.tags).toEqual(['x', 'y']);
    expect(parsed.body.trim()).toBe(body.trim());
  });

  it('throws on missing frontmatter', () => {
    expect(() => parseAtom('just body, no frontmatter')).toThrow();
  });
});

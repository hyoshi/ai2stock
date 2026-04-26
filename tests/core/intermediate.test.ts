import { describe, it, expect } from 'vitest';
import { buildAtomFromInput } from '../../src/core/intermediate.js';

describe('buildAtomFromInput', () => {
  it('classifies and assembles a complete atom from raw text', () => {
    const atom = buildAtomFromInput({
      content: 'AdapterパターンでObsidian対応を採用することに決定。',
      now: new Date('2026-04-23T10:00:00+09:00'),
      defaults: { source: 'claude-code', confidence: 'medium' },
    });

    expect(atom.frontmatter.type).toBe('decision');
    expect(atom.frontmatter.id).toMatch(/^2026-04-23-/);
    expect(atom.frontmatter.source).toBe('claude-code');
    expect(atom.frontmatter.confidence).toBe('medium');
    expect(atom.frontmatter['ai-generated']).toBe(true);
    expect(atom.body.length).toBeGreaterThan(0);
  });

  it('honors explicit type override', () => {
    const atom = buildAtomFromInput({
      content: 'plain text without strong signals',
      type: 'reference',
      now: new Date(),
      defaults: { source: 'claude-code', confidence: 'low' },
    });
    expect(atom.frontmatter.type).toBe('reference');
  });

  it('merges explicit tags with hashtag-extracted tags', () => {
    const atom = buildAtomFromInput({
      content: 'this is about #obsidian and #notion',
      tags: ['oss'],
      now: new Date(),
      defaults: { source: 'claude-code', confidence: 'medium' },
    });
    expect(atom.frontmatter.tags).toContain('oss');
    expect(atom.frontmatter.tags).toContain('obsidian');
    expect(atom.frontmatter.tags).toContain('notion');
  });

  it('attaches project from defaults when not provided', () => {
    const atom = buildAtomFromInput({
      content: 'a body',
      now: new Date(),
      defaults: { source: 'claude-code', confidence: 'medium', defaultProject: 'ai2stock' },
    });
    expect(atom.frontmatter.project).toBe('ai2stock');
  });

  it('explicit project overrides default', () => {
    const atom = buildAtomFromInput({
      content: 'a body',
      project: 'custom-project',
      now: new Date(),
      defaults: { source: 'claude-code', confidence: 'medium', defaultProject: 'ai2stock' },
    });
    expect(atom.frontmatter.project).toBe('custom-project');
  });
});

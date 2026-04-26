import { describe, it, expect } from 'vitest';
import { classify, extractTitle, extractTags } from '../../src/core/classify.js';

describe('classify', () => {
  it('classifies code-heavy content as snippet', () => {
    const content = '```bash\nnpm install foo\nnpm run build\n```\n以上のコマンドで完了';
    expect(classify(content)).toBe('snippet');
  });

  it('classifies decision keywords as decision', () => {
    const content = '議論の結果、AdapterパターンでObsidianアダプタを採用することに決定した。';
    expect(classify(content)).toBe('decision');
  });

  it('classifies learning keywords as learning', () => {
    const content = 'GDriveでObsidian Vaultを同期するとconflictファイルが大量発生する罠。理由は.obsidian/workspace.jsonの書き換え頻度が高すぎるため。';
    expect(classify(content)).toBe('learning');
  });

  it('classifies URL-heavy content as reference', () => {
    const content = 'See https://example.com/a and https://example.com/b and https://example.com/c for documentation';
    expect(classify(content)).toBe('reference');
  });

  it('falls back to learning when no patterns match', () => {
    const content = 'これはただのテキストです。何の手がかりもありません。';
    expect(classify(content)).toBe('learning');
  });
});

describe('extractTitle', () => {
  it('extracts first heading', () => {
    expect(extractTitle('# Main Title\n\nbody text')).toBe('Main Title');
  });

  it('extracts H2 heading when no H1', () => {
    expect(extractTitle('## Sub Title\n\nbody')).toBe('Sub Title');
  });

  it('falls back to first non-empty line', () => {
    expect(extractTitle('plain first line\nsecond line')).toBe('plain first line');
  });

  it('strips markdown decoration from fallback line', () => {
    expect(extractTitle('> quoted line\nmore')).toBe('quoted line');
  });

  it('truncates long titles', () => {
    const long = 'a'.repeat(200);
    expect(extractTitle(long, 50).length).toBeLessThanOrEqual(50);
    expect(extractTitle(long, 50)).toMatch(/…$/);
  });

  it('returns Untitled when content is empty', () => {
    expect(extractTitle('')).toBe('Untitled Atom');
  });
});

describe('extractTags', () => {
  it('extracts hashtags from content', () => {
    const content = 'about #obsidian and #notion integration';
    expect(extractTags(content)).toContain('obsidian');
    expect(extractTags(content)).toContain('notion');
  });

  it('merges with existing tags case-insensitively', () => {
    const result = extractTags('discusses #Obsidian sync', ['obsidian', 'sync']);
    expect(result.filter((t) => t === 'obsidian').length).toBe(1);
    expect(result).toContain('sync');
  });

  it('ignores numeric-only hashtags', () => {
    const content = 'see point #1 and #2 about #naming';
    const result = extractTags(content);
    expect(result).not.toContain('1');
    expect(result).not.toContain('2');
    expect(result).toContain('naming');
  });

  it('limits to 10 tags', () => {
    const content = Array.from({ length: 20 }, (_, i) => `#tag${i}`).join(' ');
    expect(extractTags(content).length).toBeLessThanOrEqual(10);
  });
});

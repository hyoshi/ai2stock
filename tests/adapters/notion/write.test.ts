import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Atom, NotionConfig } from '../../../src/core/types.js';

const createMock = vi.fn();
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: { create: createMock },
  })),
}));

const { writeAtomToNotion } = await import('../../../src/adapters/notion/write.js');

const cfg: NotionConfig = {
  enabled: true,
  token_env: 'TEST_NOTION_TOKEN',
  parent_page_id: 'parent-page-1234',
};

function makeAtom(overrides: Partial<Atom['frontmatter']> = {}, body = '# Title\n\nbody'): Atom {
  return {
    frontmatter: {
      id: '2026-04-26-1000-test',
      type: 'decision',
      created: '2026-04-26T10:00:00+09:00',
      'ai-generated': true,
      tags: ['oss', 'spec'],
      project: 'ai2stock',
      session_name: 'AI2Stock',
      confidence: 'high',
      ...overrides,
    },
    title: 'Test Atom',
    body,
  };
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: 'page-id-abc', url: 'https://notion.so/page-id-abc' });
  process.env.TEST_NOTION_TOKEN = 'secret_test';
});

afterEach(() => {
  delete process.env.TEST_NOTION_TOKEN;
});

describe('writeAtomToNotion (pages mode)', () => {
  it('throws if adapter disabled', async () => {
    await expect(writeAtomToNotion(makeAtom(), { ...cfg, enabled: false })).rejects.toThrow(/disabled/);
  });

  it('throws if parent_page_id missing', async () => {
    await expect(writeAtomToNotion(makeAtom(), { ...cfg, parent_page_id: '' })).rejects.toThrow(/parent_page_id/);
  });

  it('throws if token env not set', async () => {
    delete process.env.TEST_NOTION_TOKEN;
    await expect(writeAtomToNotion(makeAtom(), cfg)).rejects.toThrow(/token not found/);
  });

  it('creates page with parent.page_id (NOT database_id)', async () => {
    await writeAtomToNotion(makeAtom(), cfg);
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.parent.page_id).toBe('parent-page-1234');
    expect(arg.parent.database_id).toBeUndefined();
  });

  it('sets only Title property (no DB-specific properties)', async () => {
    await writeAtomToNotion(makeAtom(), cfg);
    const arg = createMock.mock.calls[0][0];
    const propKeys = Object.keys(arg.properties);
    expect(propKeys).toEqual(['title']);
    expect(arg.properties.title.title[0].text.content).toBe('2026-04-26-1000-test');
  });

  it('embeds frontmatter as a callout block at top of body', async () => {
    await writeAtomToNotion(makeAtom(), cfg);
    const arg = createMock.mock.calls[0][0];
    const firstBlock = arg.children[0];
    expect(firstBlock.type).toBe('callout');
    const richText = firstBlock.callout.rich_text;
    const text = richText.map((rt: { text: { content: string } }) => rt.text.content).join('');
    expect(text).toContain('type: decision');
    expect(text).toContain('project: ai2stock');
    expect(text).toContain('session: AI2Stock');
    expect(text).toContain('tags: oss, spec');
    expect(text).toContain('confidence: high');
  });

  it('converts markdown body to notion blocks (heading + paragraph) after callout', async () => {
    await writeAtomToNotion(makeAtom({}, '# Heading 1\n\nA paragraph.\n\n## Sub'), cfg);
    const arg = createMock.mock.calls[0][0];
    const types = arg.children.map((b: { type: string }) => b.type);
    expect(types[0]).toBe('callout');
    expect(types).toContain('heading_1');
    expect(types).toContain('paragraph');
    expect(types).toContain('heading_2');
  });

  it('returns pageId and url', async () => {
    const r = await writeAtomToNotion(makeAtom(), cfg);
    expect(r.pageId).toBe('page-id-abc');
    expect(r.url).toContain('notion.so');
  });
});

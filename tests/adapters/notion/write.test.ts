import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Atom, NotionConfig } from '../../../src/core/types.js';

const createMock = vi.fn();
const searchMock = vi.fn();

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: { create: createMock },
    search: searchMock,
  })),
}));

const { writeAtomToNotion, _resetSessionPageCache } = await import('../../../src/adapters/notion/write.js');

const cfg: NotionConfig = {
  enabled: true,
  token_env: 'TEST_NOTION_TOKEN',
  parent_page_id: 'parent-page-1234',
};

function makeAtom(overrides: Partial<Atom['frontmatter']> = {}, body = '# Title\n\nbody'): Atom {
  return {
    frontmatter: {
      id: '2026-04-28-1000-test',
      type: 'decision',
      created: '2026-04-28T10:00:00+09:00',
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

function pageSearchResult(id: string, title: string, parentPageId: string) {
  return {
    id,
    parent: { type: 'page_id', page_id: parentPageId },
    properties: {
      title: { type: 'title', title: [{ plain_text: title }] },
    },
  };
}

beforeEach(() => {
  createMock.mockReset();
  searchMock.mockReset();
  _resetSessionPageCache();
  process.env.TEST_NOTION_TOKEN = 'secret_test';
});

afterEach(() => {
  delete process.env.TEST_NOTION_TOKEN;
});

describe('writeAtomToNotion (pages mode with session sub-page)', () => {
  it('throws if adapter disabled', async () => {
    await expect(writeAtomToNotion(makeAtom(), { ...cfg, enabled: false })).rejects.toThrow(/disabled/);
  });

  it('throws if parent_page_id missing', async () => {
    await expect(writeAtomToNotion(makeAtom(), { ...cfg, parent_page_id: '' })).rejects.toThrow(/parent_page_id/);
  });

  it('creates session sub-page when not found, then atom under it', async () => {
    searchMock.mockResolvedValue({ results: [] });
    createMock
      .mockResolvedValueOnce({ id: 'session-page-id', url: 'https://notion/session' })
      .mockResolvedValueOnce({ id: 'atom-page-id', url: 'https://notion/atom' });

    const r = await writeAtomToNotion(makeAtom(), cfg);

    expect(createMock).toHaveBeenCalledTimes(2);
    const firstCallArg = createMock.mock.calls[0][0];
    expect(firstCallArg.parent.page_id).toBe('parent-page-1234');
    expect(firstCallArg.properties.title.title[0].text.content).toBe('AI2Stock');
    const secondCallArg = createMock.mock.calls[1][0];
    expect(secondCallArg.parent.page_id).toBe('session-page-id');
    expect(secondCallArg.properties.title.title[0].text.content).toBe('2026-04-28-1000-test');
    expect(r.pageId).toBe('atom-page-id');
  });

  it('reuses existing session sub-page when found via search', async () => {
    searchMock.mockResolvedValue({
      results: [pageSearchResult('existing-session-id', 'AI2Stock', 'parent-page-1234')],
    });
    createMock.mockResolvedValueOnce({ id: 'atom-page-id', url: 'https://notion/atom' });

    await writeAtomToNotion(makeAtom(), cfg);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].parent.page_id).toBe('existing-session-id');
  });

  it('caches session page id within process (no second search for same session)', async () => {
    searchMock.mockResolvedValue({
      results: [pageSearchResult('cached-session-id', 'AI2Stock', 'parent-page-1234')],
    });
    createMock.mockResolvedValue({ id: 'atom-page', url: 'https://notion/x' });

    await writeAtomToNotion(makeAtom(), cfg);
    await writeAtomToNotion(makeAtom({ id: '2026-04-28-1001-test2' }), cfg);

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0].parent.page_id).toBe('cached-session-id');
    expect(createMock.mock.calls[1][0].parent.page_id).toBe('cached-session-id');
  });

  it('ignores session-named pages whose parent differs from configured parent', async () => {
    searchMock.mockResolvedValue({
      results: [pageSearchResult('foreign-page-id', 'AI2Stock', 'OTHER-parent-id')],
    });
    createMock
      .mockResolvedValueOnce({ id: 'new-session-id', url: 'x' })
      .mockResolvedValueOnce({ id: 'atom-page', url: 'y' });

    await writeAtomToNotion(makeAtom(), cfg);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0].parent.page_id).toBe('parent-page-1234');
  });

  it('falls back to untitled-session when session_name missing', async () => {
    searchMock.mockResolvedValue({ results: [] });
    createMock
      .mockResolvedValueOnce({ id: 'session-id', url: 'x' })
      .mockResolvedValueOnce({ id: 'atom-id', url: 'y' });

    await writeAtomToNotion(makeAtom({ session_name: undefined }), cfg);

    expect(createMock.mock.calls[0][0].properties.title.title[0].text.content).toBe('untitled-session');
  });

  it('embeds frontmatter callout at top of atom body', async () => {
    searchMock.mockResolvedValue({ results: [pageSearchResult('s', 'AI2Stock', 'parent-page-1234')] });
    createMock.mockResolvedValueOnce({ id: 'atom-id', url: 'x' });

    await writeAtomToNotion(makeAtom(), cfg);
    const arg = createMock.mock.calls[0][0];
    expect(arg.children[0].type).toBe('callout');
    const calloutText = arg.children[0].callout.rich_text.map((rt: { text: { content: string } }) => rt.text.content).join('');
    expect(calloutText).toContain('type: decision');
    expect(calloutText).toContain('project: ai2stock');
  });

  it('throws if token env not set', async () => {
    delete process.env.TEST_NOTION_TOKEN;
    await expect(writeAtomToNotion(makeAtom(), cfg)).rejects.toThrow(/token not found/);
  });

  it('serializes concurrent ensureSessionPage calls (no double create)', async () => {
    // Both concurrent writes miss the cache; only one search+create should run for the session.
    searchMock.mockResolvedValue({ results: [] });
    let sessionCreates = 0;
    createMock.mockImplementation(async (arg: { parent: { page_id: string } }) => {
      if (arg.parent.page_id === 'parent-page-1234') {
        sessionCreates++;
        return { id: 'session-page-id', url: 'x' };
      }
      return { id: 'atom-page-' + sessionCreates, url: 'y' };
    });

    await Promise.all([
      writeAtomToNotion(makeAtom({ id: '2026-04-28-1000-a' }), cfg),
      writeAtomToNotion(makeAtom({ id: '2026-04-28-1001-b' }), cfg),
    ]);

    expect(sessionCreates).toBe(1);
    expect(searchMock).toHaveBeenCalledTimes(1);
  });
});

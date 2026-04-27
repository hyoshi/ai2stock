import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NotionConfig } from '../../../src/core/types.js';

const searchMock = vi.fn();
const appendMock = vi.fn();
const listMock = vi.fn();
const deleteMock = vi.fn();
const updateMock = vi.fn();
const retrieveMock = vi.fn();

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    search: searchMock,
    blocks: {
      children: { append: appendMock, list: listMock },
      delete: deleteMock,
    },
    pages: { update: updateMock, retrieve: retrieveMock },
  })),
}));

const {
  findNotionAtomById,
  appendToNotionAtom,
  replaceNotionAtomBody,
  archiveNotionAtom,
} = await import('../../../src/adapters/notion/edit.js');

const cfg: NotionConfig = {
  enabled: true,
  token_env: 'TEST_NOTION_TOKEN',
  parent_page_id: 'parent-page-1234',
};

beforeEach(() => {
  searchMock.mockReset();
  appendMock.mockReset();
  listMock.mockReset();
  deleteMock.mockReset();
  updateMock.mockReset();
  retrieveMock.mockReset();
  process.env.TEST_NOTION_TOKEN = 'secret_test';
});

afterEach(() => {
  delete process.env.TEST_NOTION_TOKEN;
});

function pageResult(id: string, title: string, parentPageId: string, url = 'https://notion/x') {
  return {
    id,
    url,
    parent: { type: 'page_id', page_id: parentPageId },
    properties: {
      title: {
        type: 'title',
        title: [{ plain_text: title }],
      },
    },
  };
}

describe('findNotionAtomById (pages mode, session sub-page tree)', () => {
  it('returns null when search has no results', async () => {
    searchMock.mockResolvedValue({ results: [] });
    expect(await findNotionAtomById(cfg, 'missing-id')).toBeNull();
  });

  it('returns matching page when grandparent === configured parent_page_id', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('atom-page', '2026-04-28-test', 'session-page-1')],
    });
    retrieveMock.mockResolvedValueOnce({
      parent: { type: 'page_id', page_id: 'parent-page-1234' },
    });
    const r = await findNotionAtomById(cfg, '2026-04-28-test');
    expect(r?.pageId).toBe('atom-page');
    expect(retrieveMock).toHaveBeenCalledWith({ page_id: 'session-page-1' });
  });

  it('ignores atom whose session parent is under a different workspace parent', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('atom-page', '2026-04-28-test', 'rogue-session')],
    });
    retrieveMock.mockResolvedValueOnce({
      parent: { type: 'page_id', page_id: 'OTHER-parent' },
    });
    expect(await findNotionAtomById(cfg, '2026-04-28-test')).toBeNull();
  });

  it('ignores atom whose immediate parent is not page_id type', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          id: 'atom-page',
          parent: { type: 'database_id', database_id: 'db-1' },
          properties: { title: { type: 'title', title: [{ plain_text: '2026-04-28-test' }] } },
        },
      ],
    });
    expect(await findNotionAtomById(cfg, '2026-04-28-test')).toBeNull();
  });

  it('ignores pages with similar but non-equal titles', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('atom', '2026-04-28-test-extra', 'session-1')],
    });
    expect(await findNotionAtomById(cfg, '2026-04-28-test')).toBeNull();
  });

  it('throws when adapter disabled', async () => {
    await expect(findNotionAtomById({ ...cfg, enabled: false }, 'x')).rejects.toThrow(/disabled/);
  });

  it('workspace-top-level mode: accepts atom whose session parent is at workspace root', async () => {
    const wsCfg: NotionConfig = { enabled: true, token_env: 'TEST_NOTION_TOKEN' };
    searchMock.mockResolvedValue({
      results: [pageResult('atom-page', '2026-04-28-test', 'session-page-1')],
    });
    retrieveMock.mockResolvedValueOnce({
      parent: { type: 'workspace', workspace: true },
    });
    const r = await findNotionAtomById(wsCfg, '2026-04-28-test');
    expect(r?.pageId).toBe('atom-page');
  });

  it('workspace-top-level mode: rejects atom whose session is under another page', async () => {
    const wsCfg: NotionConfig = { enabled: true, token_env: 'TEST_NOTION_TOKEN' };
    searchMock.mockResolvedValue({
      results: [pageResult('atom-page', '2026-04-28-test', 'session-page-1')],
    });
    retrieveMock.mockResolvedValueOnce({
      parent: { type: 'page_id', page_id: 'some-other-parent' },
    });
    expect(await findNotionAtomById(wsCfg, '2026-04-28-test')).toBeNull();
  });

  it('backward compat: accepts pre-v0.5.1 atoms placed directly under parent_page_id', async () => {
    // atom.parent === cfg.parent_page_id (no intermediate session page)
    searchMock.mockResolvedValue({
      results: [pageResult('legacy-atom', '2026-04-26-legacy', 'parent-page-1234')],
    });
    const r = await findNotionAtomById(cfg, '2026-04-26-legacy');
    expect(r?.pageId).toBe('legacy-atom');
    // No retrieve needed — direct match short-circuits the grandparent check
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it('warns (not silent) when session retrieve fails during verify', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('atom-page', '2026-04-28-test', 'session-page-1')],
    });
    retrieveMock.mockRejectedValueOnce(new Error('network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await findNotionAtomById(cfg, '2026-04-28-test');
    expect(r).toBeNull();
    const warns = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warns).toMatch(/failed to verify session parent/);
    warnSpy.mockRestore();
  });
});

describe('appendToNotionAtom', () => {
  it('appends new blocks to the page', async () => {
    appendMock.mockResolvedValue({});
    await appendToNotionAtom(cfg, 'page-abc', '## New Section\n\nadditional info');
    expect(appendMock).toHaveBeenCalledTimes(1);
    const arg = appendMock.mock.calls[0][0];
    expect(arg.block_id).toBe('page-abc');
    const types = arg.children.map((b: { type: string }) => b.type);
    expect(types).toContain('heading_2');
    expect(types).toContain('paragraph');
  });

  it('skips when content has no blocks', async () => {
    await appendToNotionAtom(cfg, 'page-abc', '   \n\n  ');
    expect(appendMock).not.toHaveBeenCalled();
  });
});

describe('replaceNotionAtomBody', () => {
  it('lists, deletes existing children, then appends new blocks', async () => {
    listMock.mockResolvedValue({
      results: [{ id: 'block-1' }, { id: 'block-2' }],
      has_more: false,
    });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomBody(cfg, 'page-abc', '# New body\n\ntext');

    expect(listMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(appendMock).toHaveBeenCalledTimes(1);
  });

  it('paginates list when has_more', async () => {
    listMock
      .mockResolvedValueOnce({ results: [{ id: 'b1' }], has_more: true, next_cursor: 'c1' })
      .mockResolvedValueOnce({ results: [{ id: 'b2' }], has_more: false });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});
    await replaceNotionAtomBody(cfg, 'page-abc', 'new');
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  it('warns when pagination cap (20 pages) is reached', async () => {
    listMock.mockResolvedValue({
      results: [{ id: 'b1' }],
      has_more: true,
      next_cursor: 'c',
    });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await replaceNotionAtomBody(cfg, 'page-abc', 'new');
    expect(listMock).toHaveBeenCalledTimes(20);
    const warns = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warns).toMatch(/more than 2000 child blocks/);
    warnSpy.mockRestore();
  });

  it('aborts (does not append) when any delete fails', async () => {
    listMock.mockResolvedValue({
      results: [{ id: 'b1' }, { id: 'b2' }],
      has_more: false,
    });
    deleteMock
      .mockRejectedValueOnce(new Error('cannot delete'))
      .mockResolvedValueOnce({});
    appendMock.mockResolvedValue({});
    await expect(replaceNotionAtomBody(cfg, 'page-abc', 'new')).rejects.toThrow(/replace aborted/);
    expect(appendMock).not.toHaveBeenCalled();
  });
});

describe('archiveNotionAtom (pages mode, 2-level verify)', () => {
  it('verifies atom→session→parent_page_id then archives', async () => {
    // 1st retrieve: atom page → parent is session page
    // 2nd retrieve: session page → parent is configured parent_page_id
    retrieveMock
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'session-page-1' } })
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'parent-page-1234' } });
    updateMock.mockResolvedValue({});

    await archiveNotionAtom(cfg, 'atom-page-abc');

    expect(retrieveMock).toHaveBeenNthCalledWith(1, { page_id: 'atom-page-abc' });
    expect(retrieveMock).toHaveBeenNthCalledWith(2, { page_id: 'session-page-1' });
    expect(updateMock).toHaveBeenCalledWith({ page_id: 'atom-page-abc', archived: true });
  });

  it('refuses to archive when session page is under a different workspace parent', async () => {
    retrieveMock
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'session-page-1' } })
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'OTHER-parent' } });
    await expect(archiveNotionAtom(cfg, 'atom-page-abc')).rejects.toThrow(/outside configured parent/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses to archive when atom parent type is not page_id', async () => {
    retrieveMock.mockResolvedValueOnce({
      parent: { type: 'database_id', database_id: 'some-db' },
    });
    await expect(archiveNotionAtom(cfg, 'atom-page-abc')).rejects.toThrow(/outside configured parent/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses to archive when session page parent is database', async () => {
    retrieveMock
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'session-page-1' } })
      .mockResolvedValueOnce({ parent: { type: 'database_id', database_id: 'db-1' } });
    await expect(archiveNotionAtom(cfg, 'atom-page-abc')).rejects.toThrow(/outside configured parent/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('treats hyphenated and stripped parent ids as equal', async () => {
    retrieveMock
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'session-page-1' } })
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'parent-page-1234' } });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom({ ...cfg, parent_page_id: 'PARENT-PAGE-1234' }, 'atom-page-abc');
    expect(updateMock).toHaveBeenCalled();
  });

  it('backward compat: archives v0.5.0 flat atom (atom directly under parent_page_id)', async () => {
    retrieveMock.mockResolvedValueOnce({
      parent: { type: 'page_id', page_id: 'parent-page-1234' },
    });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom(cfg, 'legacy-atom');
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ page_id: 'legacy-atom', archived: true });
  });

  it('workspace-top-level mode: archives when session parent is workspace', async () => {
    const wsCfg: NotionConfig = { enabled: true, token_env: 'TEST_NOTION_TOKEN' };
    retrieveMock
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'session-page-1' } })
      .mockResolvedValueOnce({ parent: { type: 'workspace', workspace: true } });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom(wsCfg, 'atom-page-abc');
    expect(updateMock).toHaveBeenCalledWith({ page_id: 'atom-page-abc', archived: true });
  });

  it('workspace-top-level mode: refuses when session parent is not workspace', async () => {
    const wsCfg: NotionConfig = { enabled: true, token_env: 'TEST_NOTION_TOKEN' };
    retrieveMock
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'session-page-1' } })
      .mockResolvedValueOnce({ parent: { type: 'page_id', page_id: 'some-random-page' } });
    await expect(archiveNotionAtom(wsCfg, 'atom-page-abc')).rejects.toThrow(/outside workspace top level/);
  });
});

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

describe('findNotionAtomById (pages mode)', () => {
  it('returns null when search has no results', async () => {
    searchMock.mockResolvedValue({ results: [] });
    expect(await findNotionAtomById(cfg, 'missing-id')).toBeNull();
  });

  it('returns matching page that is a direct child of parent_page_id', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('page-abc', '2026-04-26-test', 'parent-page-1234')],
    });
    const r = await findNotionAtomById(cfg, '2026-04-26-test');
    expect(r?.pageId).toBe('page-abc');
  });

  it('ignores pages with matching title but different parent', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('page-abc', '2026-04-26-test', 'OTHER-parent')],
    });
    expect(await findNotionAtomById(cfg, '2026-04-26-test')).toBeNull();
  });

  it('ignores pages with similar but non-equal titles', async () => {
    searchMock.mockResolvedValue({
      results: [pageResult('page-abc', '2026-04-26-test-extra', 'parent-page-1234')],
    });
    expect(await findNotionAtomById(cfg, '2026-04-26-test')).toBeNull();
  });

  it('throws when adapter disabled', async () => {
    await expect(findNotionAtomById({ ...cfg, enabled: false }, 'x')).rejects.toThrow(/disabled/);
  });

  it('throws when parent_page_id missing', async () => {
    await expect(findNotionAtomById({ ...cfg, parent_page_id: '' }, 'x')).rejects.toThrow(/parent_page_id/);
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

describe('archiveNotionAtom (pages mode)', () => {
  it('verifies page parent matches configured parent_page_id then archives', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'page_id', page_id: 'parent-page-1234' },
    });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom(cfg, 'page-abc');
    expect(retrieveMock).toHaveBeenCalledWith({ page_id: 'page-abc' });
    expect(updateMock).toHaveBeenCalledWith({ page_id: 'page-abc', archived: true });
  });

  it('refuses to archive when page parent differs from configured parent', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'page_id', page_id: 'OTHER-parent' },
    });
    await expect(archiveNotionAtom(cfg, 'page-abc')).rejects.toThrow(/outside configured parent/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses to archive when parent type is database (DB-mode page)', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'database_id', database_id: 'some-db' },
    });
    await expect(archiveNotionAtom(cfg, 'page-abc')).rejects.toThrow(/outside configured parent/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('treats hyphenated and stripped parent ids as equal', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'page_id', page_id: 'parent-page-1234' },
    });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom({ ...cfg, parent_page_id: 'PARENT-PAGE-1234' }, 'page-abc');
    expect(updateMock).toHaveBeenCalled();
  });
});

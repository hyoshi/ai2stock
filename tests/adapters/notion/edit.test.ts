import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NotionConfig } from '../../../src/core/types.js';

const queryMock = vi.fn();
const appendMock = vi.fn();
const listMock = vi.fn();
const deleteMock = vi.fn();
const updateMock = vi.fn();
const retrieveMock = vi.fn();

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: { query: queryMock },
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
  database_id: 'db-test',
};

beforeEach(() => {
  queryMock.mockReset();
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

describe('findNotionAtomById', () => {
  it('returns null when no match', async () => {
    queryMock.mockResolvedValue({ results: [] });
    expect(await findNotionAtomById(cfg, 'missing-id')).toBeNull();
  });

  it('returns pageId/url when match', async () => {
    queryMock.mockResolvedValue({
      results: [{ id: 'page-abc', url: 'https://notion.so/page-abc' }],
    });
    const r = await findNotionAtomById(cfg, '2026-04-26-test');
    expect(r?.pageId).toBe('page-abc');
    expect(r?.url).toBe('https://notion.so/page-abc');
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        database_id: 'db-test',
        page_size: 1,
      }),
    );
  });

  it('throws when adapter disabled', async () => {
    await expect(findNotionAtomById({ ...cfg, enabled: false }, 'x')).rejects.toThrow(/disabled/);
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
    expect(deleteMock).toHaveBeenCalledWith({ block_id: 'block-1' });
    expect(deleteMock).toHaveBeenCalledWith({ block_id: 'block-2' });
    expect(appendMock).toHaveBeenCalledTimes(1);
  });

  it('paginates list when has_more', async () => {
    listMock
      .mockResolvedValueOnce({
        results: [{ id: 'b1' }],
        has_more: true,
        next_cursor: 'cursor1',
      })
      .mockResolvedValueOnce({
        results: [{ id: 'b2' }],
        has_more: false,
      });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomBody(cfg, 'page-abc', 'new');

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  it('warns when pagination cap (20 pages = 2000 blocks) is reached', async () => {
    // Always say has_more so the loop runs the full 20 iterations
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

  it('aborts (does not append) when any delete fails — atomicity guard', async () => {
    listMock.mockResolvedValue({
      results: [{ id: 'b1' }, { id: 'b2' }],
      has_more: false,
    });
    deleteMock
      .mockRejectedValueOnce(new Error('cannot delete'))
      .mockResolvedValueOnce({});
    appendMock.mockResolvedValue({});

    await expect(replaceNotionAtomBody(cfg, 'page-abc', 'new')).rejects.toThrow(/replace aborted/);
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(appendMock).not.toHaveBeenCalled();
  });
});

describe('archiveNotionAtom', () => {
  it('verifies page parent DB then archives', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'database_id', database_id: 'db-test' },
    });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom(cfg, 'page-abc');
    expect(retrieveMock).toHaveBeenCalledWith({ page_id: 'page-abc' });
    expect(updateMock).toHaveBeenCalledWith({ page_id: 'page-abc', archived: true });
  });

  it('refuses to archive when page belongs to different DB', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'database_id', database_id: 'OTHER-db' },
    });
    await expect(archiveNotionAtom(cfg, 'page-abc')).rejects.toThrow(/outside configured DB/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('refuses to archive when parent type is not database', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'page_id' },
    });
    await expect(archiveNotionAtom(cfg, 'page-abc')).rejects.toThrow(/outside configured DB/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('treats hyphenated and stripped DB ids as equal', async () => {
    retrieveMock.mockResolvedValue({
      parent: { type: 'database_id', database_id: 'db-test' },
    });
    updateMock.mockResolvedValue({});
    await archiveNotionAtom({ ...cfg, database_id: 'DB-TEST' }, 'page-abc');
    expect(updateMock).toHaveBeenCalled();
  });
});

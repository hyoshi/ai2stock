import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NotionConfig } from '../../../src/core/types.js';

const queryMock = vi.fn();
const appendMock = vi.fn();
const listMock = vi.fn();
const deleteMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: { query: queryMock },
    blocks: {
      children: { append: appendMock, list: listMock },
      delete: deleteMock,
    },
    pages: { update: updateMock },
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

  it('continues despite per-block delete failures', async () => {
    listMock.mockResolvedValue({
      results: [{ id: 'b1' }, { id: 'b2' }],
      has_more: false,
    });
    deleteMock
      .mockRejectedValueOnce(new Error('cannot delete'))
      .mockResolvedValueOnce({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomBody(cfg, 'page-abc', 'new');
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(appendMock).toHaveBeenCalledTimes(1);
  });
});

describe('archiveNotionAtom', () => {
  it('calls pages.update with archived=true', async () => {
    updateMock.mockResolvedValue({});
    await archiveNotionAtom(cfg, 'page-abc');
    expect(updateMock).toHaveBeenCalledWith({ page_id: 'page-abc', archived: true });
  });
});

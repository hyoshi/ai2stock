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
  listNotionAtomSections,
  replaceNotionAtomSection,
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

function headingBlock(id: string, level: 1 | 2 | 3, text: string): Record<string, unknown> {
  const key = `heading_${level}` as const;
  return {
    id,
    type: key,
    [key]: { rich_text: [{ plain_text: text }] },
  };
}

function paraBlock(id: string, text: string): Record<string, unknown> {
  return {
    id,
    type: 'paragraph',
    paragraph: { rich_text: [{ plain_text: text }] },
  };
}

describe('listNotionAtomSections', () => {
  it('returns plain text of all heading_1/2/3 blocks in order', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 1, 'Top'),
        paraBlock('p1', 'intro'),
        headingBlock('h2', 2, 'Section A'),
        paraBlock('p2', 'body of A'),
        headingBlock('h3', 3, 'Sub of A'),
        headingBlock('h4', 2, 'Section B'),
      ],
      has_more: false,
    });
    const sections = await listNotionAtomSections(cfg, 'page-abc');
    expect(sections).toEqual(['Top', 'Section A', 'Sub of A', 'Section B']);
  });

  it('returns [] when there are no headings', async () => {
    listMock.mockResolvedValue({
      results: [paraBlock('p1', 'just text'), paraBlock('p2', 'more text')],
      has_more: false,
    });
    expect(await listNotionAtomSections(cfg, 'page-abc')).toEqual([]);
  });

  it('paginates list when has_more', async () => {
    listMock
      .mockResolvedValueOnce({
        results: [headingBlock('h1', 2, 'First')],
        has_more: true,
        next_cursor: 'c1',
      })
      .mockResolvedValueOnce({
        results: [headingBlock('h2', 2, 'Second')],
        has_more: false,
      });
    expect(await listNotionAtomSections(cfg, 'page-abc')).toEqual(['First', 'Second']);
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('filters out headings with empty/whitespace text', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 2, 'Real'),
        headingBlock('h2', 2, ''),
        headingBlock('h3', 2, '   '),
        headingBlock('h4', 2, 'Also Real'),
      ],
      has_more: false,
    });
    expect(await listNotionAtomSections(cfg, 'page-abc')).toEqual(['Real', 'Also Real']);
  });

  it('warns when duplicate heading titles exist', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 2, 'Same'),
        paraBlock('p', 'x'),
        headingBlock('h2', 2, 'Same'),
      ],
      has_more: false,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sections = await listNotionAtomSections(cfg, 'page-abc');
    expect(sections).toEqual(['Same', 'Same']);
    const warns = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warns).toMatch(/duplicate heading.*Same/);
    warnSpy.mockRestore();
  });
});

describe('replaceNotionAtomSection', () => {
  it('finds heading, deletes section body, appends new blocks after heading', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 2, 'Section A'),
        paraBlock('a-body-1', 'old line 1'),
        paraBlock('a-body-2', 'old line 2'),
        headingBlock('h2', 2, 'Section B'),
        paraBlock('b-body', 'untouched'),
      ],
      has_more: false,
    });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomSection(cfg, 'page-abc', 'Section A', 'fresh body');

    expect(deleteMock).toHaveBeenCalledTimes(2);
    const deletedIds = deleteMock.mock.calls.map((c) => c[0].block_id);
    expect(deletedIds).toEqual(['a-body-1', 'a-body-2']);
    expect(appendMock).toHaveBeenCalledTimes(1);
    const appendArg = appendMock.mock.calls[0][0];
    expect(appendArg.block_id).toBe('page-abc');
    expect(appendArg.after).toBe('h1');
    const types = appendArg.children.map((b: { type: string }) => b.type);
    expect(types).toContain('paragraph');
  });

  it('section ending at end-of-page deletes all trailing blocks', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 2, 'Other'),
        paraBlock('p-other', 'untouched'),
        headingBlock('h2', 2, 'Last'),
        paraBlock('last-1', 'old 1'),
        paraBlock('last-2', 'old 2'),
      ],
      has_more: false,
    });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomSection(cfg, 'page-abc', 'Last', 'new');

    const deletedIds = deleteMock.mock.calls.map((c) => c[0].block_id);
    expect(deletedIds).toEqual(['last-1', 'last-2']);
    expect(appendMock.mock.calls[0][0].after).toBe('h2');
  });

  it('section ending at higher-level heading (h3 section ends at h2)', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h2-1', 2, 'Outer'),
        headingBlock('h3-1', 3, 'Inner'),
        paraBlock('inner-1', 'inner body'),
        headingBlock('h2-2', 2, 'Sibling Outer'),
        paraBlock('sib-1', 'sibling body'),
      ],
      has_more: false,
    });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomSection(cfg, 'page-abc', 'Inner', 'replacement');

    const deletedIds = deleteMock.mock.calls.map((c) => c[0].block_id);
    expect(deletedIds).toEqual(['inner-1']);
    expect(appendMock.mock.calls[0][0].after).toBe('h3-1');
  });

  it('throws when no heading matches the section title', async () => {
    listMock.mockResolvedValue({
      results: [headingBlock('h1', 2, 'Existing')],
      has_more: false,
    });
    await expect(
      replaceNotionAtomSection(cfg, 'page-abc', 'Missing', 'x'),
    ).rejects.toThrow(/Section not found: Missing/);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(appendMock).not.toHaveBeenCalled();
  });

  it('rejects empty/whitespace section title before any API call', async () => {
    await expect(
      replaceNotionAtomSection(cfg, 'page-abc', '', 'x'),
    ).rejects.toThrow(/non-empty/);
    await expect(
      replaceNotionAtomSection(cfg, 'page-abc', '   ', 'x'),
    ).rejects.toThrow(/non-empty/);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('aborts (does not append) when any delete fails', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 2, 'Target'),
        paraBlock('body-1', 'old'),
        paraBlock('body-2', 'old2'),
      ],
      has_more: false,
    });
    deleteMock
      .mockRejectedValueOnce(new Error('cannot delete'))
      .mockResolvedValueOnce({});
    await expect(
      replaceNotionAtomSection(cfg, 'page-abc', 'Target', 'new'),
    ).rejects.toThrow(/section replace aborted/);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it('skips appending when new content has no blocks (delete still runs)', async () => {
    listMock.mockResolvedValue({
      results: [
        headingBlock('h1', 2, 'Empty'),
        paraBlock('body-1', 'old'),
        headingBlock('h2', 2, 'Other'),
      ],
      has_more: false,
    });
    deleteMock.mockResolvedValue({});
    appendMock.mockResolvedValue({});

    await replaceNotionAtomSection(cfg, 'page-abc', 'Empty', '   \n\n   ');

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(appendMock).not.toHaveBeenCalled();
  });
});

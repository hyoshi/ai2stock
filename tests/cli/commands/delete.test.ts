import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Config } from '../../../src/core/types.js';

const loadConfigMock = vi.fn();
const findObsidianMock = vi.fn();
const deleteFileMock = vi.fn();
const findNotionMock = vi.fn();
const archiveNotionMock = vi.fn();
const isInsideDirMock = vi.fn();

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: () => loadConfigMock(),
}));
vi.mock('../../../src/adapters/obsidian/edit.js', () => ({
  findAtomById: (...args: unknown[]) => findObsidianMock(...args),
  deleteAtomFile: (...args: unknown[]) => deleteFileMock(...args),
}));
vi.mock('../../../src/adapters/notion/edit.js', () => ({
  findNotionAtomById: (...args: unknown[]) => findNotionMock(...args),
  archiveNotionAtom: (...args: unknown[]) => archiveNotionMock(...args),
}));
vi.mock('../../../src/core/fs-utils.js', () => ({
  isInsideDir: (...args: unknown[]) => isInsideDirMock(...args),
}));

const { deleteCommand } = await import('../../../src/cli/commands/delete.js');

function cfgWithBoth(): Config {
  return {
    version: 1,
    adapters: ['obsidian', 'notion'],
    obsidian: {
      enabled: true,
      vault_path: '/tmp/vault',
      folders: { atoms: '10-Atoms', sessions: '20-Sessions', moc: '00-MOC' },
    },
    notion: { enabled: true, token_env: 'NOTION_TOKEN', database_id: 'db1' },
    defaults: {
      source: 'claude-code',
      confidence: 'medium',
      primary_adapter: 'obsidian',
      primary_search_adapter: 'obsidian',
      write_strategy: 'primary_only',
    },
  };
}

beforeEach(() => {
  loadConfigMock.mockReset();
  findObsidianMock.mockReset();
  deleteFileMock.mockReset();
  findNotionMock.mockReset();
  archiveNotionMock.mockReset();
  isInsideDirMock.mockReset();
  isInsideDirMock.mockReturnValue(true);
  process.exitCode = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe('deleteCommand', () => {
  it('throws when --id missing', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    await expect(deleteCommand({})).rejects.toThrow(/--id/);
  });

  it('default targets only primary adapter (Obsidian) — no Notion call', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue({
      filePath: '/tmp/vault/x.md',
      title: 'X',
      frontmatter: { type: 'decision' },
    });
    await deleteCommand({ id: 'x', force: true });
    expect(deleteFileMock).toHaveBeenCalledWith('/tmp/vault/x.md');
    expect(findNotionMock).not.toHaveBeenCalled();
    expect(archiveNotionMock).not.toHaveBeenCalled();
  });

  it('--to=all deletes from both adapters', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue({
      filePath: '/tmp/vault/x.md',
      title: 'X',
      frontmatter: { type: 'decision' },
    });
    findNotionMock.mockResolvedValue({ pageId: 'page-x', title: 'x', url: 'https://notion/x' });
    await deleteCommand({ id: 'x', force: true, to: 'all' });
    expect(deleteFileMock).toHaveBeenCalledTimes(1);
    expect(archiveNotionMock).toHaveBeenCalledWith(expect.anything(), 'page-x');
  });

  it('--to=notion archives Notion only', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findNotionMock.mockResolvedValue({ pageId: 'page-x', title: 'x', url: 'u' });
    await deleteCommand({ id: 'x', force: true, to: 'notion' });
    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(archiveNotionMock).toHaveBeenCalled();
    expect(findObsidianMock).not.toHaveBeenCalled();
  });

  it('preview mode (no --force) does not delete or archive', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue({
      filePath: '/tmp/vault/x.md',
      title: 'X',
      frontmatter: { type: 'decision' },
    });
    await deleteCommand({ id: 'x' });
    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(archiveNotionMock).not.toHaveBeenCalled();
  });

  it('throws when atom not found in any target', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue(null);
    await expect(deleteCommand({ id: 'missing', force: true })).rejects.toThrow(/not found/);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('--to=all: continues with Notion when Obsidian delete fails (does not throw), sets exit code', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue({
      filePath: '/tmp/vault/x.md',
      title: 'X',
      frontmatter: { type: 'decision' },
    });
    findNotionMock.mockResolvedValue({ pageId: 'page-x', title: 'x', url: 'u' });
    deleteFileMock.mockImplementation(() => {
      throw new Error('disk full');
    });
    archiveNotionMock.mockResolvedValue(undefined);

    await expect(deleteCommand({ id: 'x', force: true, to: 'all' })).resolves.toBeUndefined();
    expect(archiveNotionMock).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('refuses to delete when target path is outside vault (security guard)', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue({
      filePath: '/etc/passwd',
      title: 'X',
      frontmatter: { type: 'decision' },
    });
    isInsideDirMock.mockReturnValue(false);

    await expect(deleteCommand({ id: 'x', force: true })).rejects.toThrow(/outside vault/);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('--to=all: throws when atom missing in BOTH adapters (compound branch)', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findObsidianMock.mockReturnValue(null);
    findNotionMock.mockResolvedValue(null);
    await expect(deleteCommand({ id: 'missing', force: true, to: 'all' })).rejects.toThrow(/not found in any target/);
    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(archiveNotionMock).not.toHaveBeenCalled();
  });

  it('--to=notion: throws when Notion archive fails (single target)', async () => {
    loadConfigMock.mockReturnValue(cfgWithBoth());
    findNotionMock.mockResolvedValue({ pageId: 'page-x', title: 'x', url: 'u' });
    archiveNotionMock.mockRejectedValue(new Error('rate limited'));

    await expect(deleteCommand({ id: 'x', force: true, to: 'notion' })).rejects.toThrow(/rate limited/);
    expect(process.exitCode).toBe(1);
  });

  it('throws when --to=notion but notion adapter disabled in config', async () => {
    const cfg = cfgWithBoth();
    cfg.notion = { enabled: false, token_env: 'X', database_id: 'd' };
    loadConfigMock.mockReturnValue(cfg);
    await expect(deleteCommand({ id: 'x', force: true, to: 'notion' })).rejects.toThrow(/notion adapter is not enabled/);
  });
});

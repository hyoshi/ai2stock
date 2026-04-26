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
  database_id: 'db-test-1234',
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

describe('writeAtomToNotion', () => {
  it('throws if adapter disabled', async () => {
    await expect(writeAtomToNotion(makeAtom(), { ...cfg, enabled: false })).rejects.toThrow(/disabled/);
  });

  it('throws if database_id missing', async () => {
    await expect(writeAtomToNotion(makeAtom(), { ...cfg, database_id: '' })).rejects.toThrow(/database_id/);
  });

  it('throws if token env not set', async () => {
    delete process.env.TEST_NOTION_TOKEN;
    await expect(writeAtomToNotion(makeAtom(), cfg)).rejects.toThrow(/token not found/);
  });

  it('calls pages.create with correct parent', async () => {
    await writeAtomToNotion(makeAtom(), cfg);
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.parent.database_id).toBe('db-test-1234');
  });

  it('maps frontmatter to properties (Title/Type/Tags/Project/Session/Confidence/AI-Generated/Created)', async () => {
    await writeAtomToNotion(makeAtom(), cfg);
    const arg = createMock.mock.calls[0][0];
    expect(arg.properties.Title.title[0].text.content).toBe('2026-04-26-1000-test');
    expect(arg.properties.Type.select.name).toBe('decision');
    expect(arg.properties.Tags.multi_select.map((t: { name: string }) => t.name)).toEqual(['oss', 'spec']);
    expect(arg.properties.Project.select.name).toBe('ai2stock');
    expect(arg.properties.Session.rich_text[0].text.content).toBe('AI2Stock');
    expect(arg.properties.Confidence.select.name).toBe('high');
    expect(arg.properties['AI-Generated'].checkbox).toBe(true);
    expect(arg.properties.Created.date.start).toBe('2026-04-26T10:00:00+09:00');
  });

  it('converts markdown body to notion blocks (heading + paragraph)', async () => {
    await writeAtomToNotion(makeAtom({}, '# Heading 1\n\nA paragraph.\n\n## Sub\n\nmore'), cfg);
    const arg = createMock.mock.calls[0][0];
    const types = arg.children.map((b: { type: string }) => b.type);
    expect(types).toContain('heading_1');
    expect(types).toContain('paragraph');
    expect(types).toContain('heading_2');
  });

  it('converts code fence to code block with language', async () => {
    await writeAtomToNotion(makeAtom({}, '```bash\nnpm install\n```'), cfg);
    const arg = createMock.mock.calls[0][0];
    const code = arg.children.find((b: { type: string }) => b.type === 'code');
    expect(code).toBeDefined();
    expect(code.code.language).toBe('bash');
    expect(code.code.rich_text[0].text.content).toContain('npm install');
  });

  it('converts blockquote', async () => {
    await writeAtomToNotion(makeAtom({}, '> Session: AI2Stock\n> Date: 2026-04-26\n\nbody'), cfg);
    const arg = createMock.mock.calls[0][0];
    const quotes = arg.children.filter((b: { type: string }) => b.type === 'quote');
    expect(quotes.length).toBeGreaterThanOrEqual(2);
  });

  it('converts bullet list items', async () => {
    await writeAtomToNotion(makeAtom({}, '- item1\n- item2\n- item3'), cfg);
    const arg = createMock.mock.calls[0][0];
    const bullets = arg.children.filter((b: { type: string }) => b.type === 'bulleted_list_item');
    expect(bullets.length).toBe(3);
  });

  it('returns pageId and url', async () => {
    const r = await writeAtomToNotion(makeAtom(), cfg);
    expect(r.pageId).toBe('page-id-abc');
    expect(r.url).toContain('notion.so');
  });
});

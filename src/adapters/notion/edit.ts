import { Client } from '@notionhq/client';
import type { NotionConfig } from '../../core/types.js';
import { buildBlocks } from './blocks.js';

export interface NotionAtomRef {
  pageId: string;
  title: string;
  url: string;
}

function getClient(cfg: NotionConfig, tokenEnvOverride?: string): Client {
  if (!cfg.enabled) throw new Error('Notion adapter is disabled');
  if (!cfg.parent_page_id) throw new Error('Notion parent_page_id is not configured');
  const tokenEnv = tokenEnvOverride ?? cfg.token_env ?? 'NOTION_TOKEN';
  const token = process.env[tokenEnv];
  if (!token) {
    throw new Error(
      `Notion token not found in env: ${tokenEnv}. ` +
        `Set ${tokenEnv}=secret_xxx in your shell or .env`,
    );
  }
  return new Client({ auth: token });
}

function normalizeNotionId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

function extractPlainTitle(page: unknown): string {
  const props = (page as { properties?: Record<string, unknown> }).properties;
  if (!props) return '';
  for (const key of Object.keys(props)) {
    const prop = props[key] as { type?: string; title?: Array<{ plain_text?: string }> };
    if (prop?.type === 'title' && Array.isArray(prop.title)) {
      return prop.title.map((t) => t.plain_text ?? '').join('');
    }
  }
  return '';
}

export async function findNotionAtomById(
  cfg: NotionConfig,
  id: string,
  tokenEnvOverride?: string,
): Promise<NotionAtomRef | null> {
  const client = getClient(cfg, tokenEnvOverride);

  // Notion has no per-parent listing API for child pages, so use search.
  // Then verify the matched page is a child of the configured parent page.
  const response = await client.search({
    query: id,
    filter: { property: 'object', value: 'page' },
    page_size: 100,
  });

  const results = (response as { results: Array<{ id: string; url?: string; parent?: { type?: string; page_id?: string } }>; has_more?: boolean }).results;
  if ((response as { has_more?: boolean }).has_more) {
    console.warn(
      `[ai2stock] Notion: search returned 100+ matches for "${id}"; only the first page is scanned. ` +
        `If the atom is not found, narrow the title or implement search pagination (v0.5.1).`,
    );
  }
  const cfgParent = normalizeNotionId(cfg.parent_page_id);

  for (const page of results) {
    const title = extractPlainTitle(page);
    if (title !== id) continue;
    const parentType = page.parent?.type;
    const parentPageId = page.parent?.page_id ? normalizeNotionId(page.parent.page_id) : '';
    if (parentType === 'page_id' && parentPageId === cfgParent) {
      const url = page.url ?? `https://www.notion.so/${page.id.replace(/-/g, '')}`;
      return { pageId: page.id, title: id, url };
    }
  }
  return null;
}

export async function appendToNotionAtom(
  cfg: NotionConfig,
  pageId: string,
  content: string,
  tokenEnvOverride?: string,
): Promise<void> {
  const client = getClient(cfg, tokenEnvOverride);
  const newBlocks = buildBlocks(content);
  if (newBlocks.length === 0) return;
  await client.blocks.children.append({
    block_id: pageId,
    children: newBlocks as never,
  });
}

export async function replaceNotionAtomBody(
  cfg: NotionConfig,
  pageId: string,
  content: string,
  tokenEnvOverride?: string,
): Promise<void> {
  const client = getClient(cfg, tokenEnvOverride);

  const PAGE_CAP = 20;
  const existingIds: string[] = [];
  let cursor: string | undefined = undefined;
  let truncated = false;
  let i = 0;
  for (; i < PAGE_CAP; i++) {
    const page = await client.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    const results = (page as { results: Array<{ id: string }> }).results;
    for (const child of results) existingIds.push(child.id);
    const hasMore = (page as { has_more: boolean }).has_more;
    if (!hasMore) break;
    cursor = (page as { next_cursor?: string | null }).next_cursor ?? undefined;
    if (!cursor) break;
    if (i === PAGE_CAP - 1 && hasMore) {
      truncated = true;
    }
  }
  if (truncated) {
    console.warn(`[ai2stock] Notion: page has more than ${PAGE_CAP * 100} child blocks; older blocks will not be deleted in this replace.`);
  }

  const deleteFailures: Array<{ id: string; reason: string }> = [];
  for (const blockId of existingIds) {
    try {
      await client.blocks.delete({ block_id: blockId });
    } catch (e) {
      deleteFailures.push({ id: blockId, reason: (e as Error).message });
    }
  }
  if (deleteFailures.length > 0) {
    const summary = deleteFailures
      .slice(0, 3)
      .map((f) => `${f.id}: ${f.reason}`)
      .join('; ');
    throw new Error(
      `Notion replace aborted: ${deleteFailures.length} of ${existingIds.length} block deletes failed. ` +
        `Page kept in pre-replace state. First failures: ${summary}`,
    );
  }

  const newBlocks = buildBlocks(content);
  if (newBlocks.length === 0) return;
  await client.blocks.children.append({
    block_id: pageId,
    children: newBlocks as never,
  });
}

export async function archiveNotionAtom(
  cfg: NotionConfig,
  pageId: string,
  tokenEnvOverride?: string,
): Promise<void> {
  const client = getClient(cfg, tokenEnvOverride);

  // Defense-in-depth: verify pageId actually belongs to the configured parent
  // page before archiving. Prevents accidental archive of arbitrary pages
  // the integration has access to.
  try {
    const page = await client.pages.retrieve({ page_id: pageId });
    const parent = (page as { parent?: { type?: string; page_id?: string } }).parent;
    const parentPageRaw = parent?.page_id ?? '';
    const parentNorm = normalizeNotionId(parentPageRaw);
    const cfgNorm = normalizeNotionId(cfg.parent_page_id);
    if (parent?.type !== 'page_id' || parentNorm !== cfgNorm) {
      throw new Error(
        `Refusing to archive page outside configured parent. page parent=${parentPageRaw}, expected=${cfg.parent_page_id}`,
      );
    }
  } catch (e) {
    if ((e as Error).message?.startsWith('Refusing to archive')) throw e;
    throw new Error(`Notion: cannot verify page parent: ${(e as Error).message}`);
  }

  await client.pages.update({
    page_id: pageId,
    archived: true,
  });
}

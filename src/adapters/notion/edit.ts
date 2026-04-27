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

  // Tree: cfg.parent_page_id > <session-name> page > <atom> page.
  // Notion has no per-parent listing API; use search by title then verify
  // the matched atom's grandparent === cfg.parent_page_id.
  const response = await client.search({
    query: id,
    filter: { property: 'object', value: 'page' },
    page_size: 100,
  });

  const results = (response as { results: Array<{ id: string; url?: string; parent?: { type?: string; page_id?: string } }>; has_more?: boolean }).results;
  if ((response as { has_more?: boolean }).has_more) {
    console.warn(
      `[ai2stock] Notion: search returned 100+ matches for "${id}"; only the first page is scanned. ` +
        `If the atom is not found, narrow the title or implement search pagination (future).`,
    );
  }
  const cfgParent = normalizeNotionId(cfg.parent_page_id);

  for (const page of results) {
    const title = extractPlainTitle(page);
    if (title !== id) continue;
    if (page.parent?.type !== 'page_id') continue;
    const immediateParent = page.parent.page_id ?? '';
    if (!immediateParent) continue;

    // Backward compat: pre-v0.5.1 atoms were placed flat under parent_page_id
    // (no session sub-page). Accept those too.
    if (normalizeNotionId(immediateParent) === cfgParent) {
      const url = page.url ?? `https://www.notion.so/${page.id.replace(/-/g, '')}`;
      return { pageId: page.id, title: id, url };
    }

    // v0.5.1+: verify grandparent (session page's parent === cfg.parent_page_id).
    try {
      const sessionPage = await client.pages.retrieve({ page_id: immediateParent });
      const grand = (sessionPage as { parent?: { type?: string; page_id?: string } }).parent;
      if (grand?.type !== 'page_id') continue;
      if (normalizeNotionId(grand.page_id ?? '') !== cfgParent) continue;
    } catch (e) {
      console.warn(`[ai2stock] Notion: failed to verify session parent for ${page.id}: ${(e as Error).message}`);
      continue;
    }
    const url = page.url ?? `https://www.notion.so/${page.id.replace(/-/g, '')}`;
    return { pageId: page.id, title: id, url };
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

  // Defense-in-depth: verify pageId is in the tree
  //   cfg.parent_page_id > session page > atom (v0.5.1+, current)
  // OR
  //   cfg.parent_page_id > atom (v0.5.0, backward compat)
  // Prevents accidental archive of arbitrary pages the integration can reach.
  const cfgNorm = normalizeNotionId(cfg.parent_page_id);
  try {
    const page = await client.pages.retrieve({ page_id: pageId });
    const parent = (page as { parent?: { type?: string; page_id?: string } }).parent;
    if (parent?.type !== 'page_id' || !parent.page_id) {
      throw new Error(
        `Refusing to archive page outside configured parent. page parent type=${parent?.type ?? 'unknown'}`,
      );
    }
    const immediateNorm = normalizeNotionId(parent.page_id);
    if (immediateNorm === cfgNorm) {
      // 1-level (legacy v0.5.0 flat atom) — accept.
    } else {
      // 2-level: session page must live under cfg.parent_page_id.
      const sessionPage = await client.pages.retrieve({ page_id: parent.page_id });
      const grand = (sessionPage as { parent?: { type?: string; page_id?: string } }).parent;
      const grandNorm = normalizeNotionId(grand?.page_id ?? '');
      if (grand?.type !== 'page_id' || grandNorm !== cfgNorm) {
        throw new Error(
          `Refusing to archive page outside configured parent. session parent=${grand?.page_id ?? ''}, expected=${cfg.parent_page_id}`,
        );
      }
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

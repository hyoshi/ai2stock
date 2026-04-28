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
  const cfgParent = cfg.parent_page_id ? normalizeNotionId(cfg.parent_page_id) : '';

  for (const page of results) {
    const title = extractPlainTitle(page);
    if (title !== id) continue;
    if (page.parent?.type !== 'page_id') continue;
    const immediateParent = page.parent.page_id ?? '';
    if (!immediateParent) continue;

    // Backward compat (v0.5.0): atom directly under cfg.parent_page_id without
    // an intermediate session page.
    if (cfgParent && normalizeNotionId(immediateParent) === cfgParent) {
      const url = page.url ?? `https://www.notion.so/${page.id.replace(/-/g, '')}`;
      return { pageId: page.id, title: id, url };
    }

    // Verify grandparent: session page's parent must match the configured
    // location. If parent_page_id is set, grand must equal it. Otherwise
    // (workspace-top-level mode), grand must be type=workspace.
    try {
      const sessionPage = await client.pages.retrieve({ page_id: immediateParent });
      const grand = (sessionPage as { parent?: { type?: string; page_id?: string } }).parent;
      if (cfgParent) {
        if (grand?.type !== 'page_id') continue;
        if (normalizeNotionId(grand.page_id ?? '') !== cfgParent) continue;
      } else {
        if (grand?.type !== 'workspace') continue;
      }
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

interface ChildBlock {
  id: string;
  type?: string;
  heading_1?: { rich_text?: Array<{ plain_text?: string }> };
  heading_2?: { rich_text?: Array<{ plain_text?: string }> };
  heading_3?: { rich_text?: Array<{ plain_text?: string }> };
}

const PAGE_CAP = 20;

async function fetchAllChildren(client: Client, pageId: string): Promise<ChildBlock[]> {
  const all: ChildBlock[] = [];
  let cursor: string | undefined = undefined;
  let truncated = false;
  for (let i = 0; i < PAGE_CAP; i++) {
    const page = await client.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    const results = (page as { results: ChildBlock[] }).results;
    for (const child of results) all.push(child);
    const hasMore = (page as { has_more: boolean }).has_more;
    if (!hasMore) break;
    cursor = (page as { next_cursor?: string | null }).next_cursor ?? undefined;
    if (!cursor) break;
    if (i === PAGE_CAP - 1 && hasMore) {
      truncated = true;
    }
  }
  if (truncated) {
    console.warn(`[ai2stock] Notion: page has more than ${PAGE_CAP * 100} child blocks; older blocks will not be processed.`);
  }
  return all;
}

function headingLevel(block: ChildBlock): 1 | 2 | 3 | null {
  if (block.type === 'heading_1') return 1;
  if (block.type === 'heading_2') return 2;
  if (block.type === 'heading_3') return 3;
  return null;
}

function headingText(block: ChildBlock): string | null {
  const level = headingLevel(block);
  if (!level) return null;
  const key = `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3';
  const rich = block[key]?.rich_text ?? [];
  return rich.map((r) => r.plain_text ?? '').join('');
}

async function deleteBlocksOrAbort(
  client: Client,
  ids: string[],
  context: string,
): Promise<void> {
  const failures: Array<{ id: string; reason: string }> = [];
  for (const blockId of ids) {
    try {
      await client.blocks.delete({ block_id: blockId });
    } catch (e) {
      failures.push({ id: blockId, reason: (e as Error).message });
    }
  }
  if (failures.length > 0) {
    const summary = failures.slice(0, 3).map((f) => `${f.id}: ${f.reason}`).join('; ');
    throw new Error(
      `Notion ${context} aborted: ${failures.length} of ${ids.length} block deletes failed. First failures: ${summary}`,
    );
  }
}

export async function replaceNotionAtomBody(
  cfg: NotionConfig,
  pageId: string,
  content: string,
  tokenEnvOverride?: string,
): Promise<void> {
  const client = getClient(cfg, tokenEnvOverride);

  const all = await fetchAllChildren(client, pageId);
  await deleteBlocksOrAbort(client, all.map((b) => b.id), 'replace');

  const newBlocks = buildBlocks(content);
  if (newBlocks.length === 0) return;
  await client.blocks.children.append({
    block_id: pageId,
    children: newBlocks as never,
  });
}

export async function listNotionAtomSections(
  cfg: NotionConfig,
  pageId: string,
  tokenEnvOverride?: string,
): Promise<string[]> {
  const client = getClient(cfg, tokenEnvOverride);
  const all = await fetchAllChildren(client, pageId);
  const sections: string[] = [];
  for (const b of all) {
    const t = headingText(b);
    if (t !== null && t.trim() !== '') sections.push(t);
  }
  // Duplicates are kept (parity with Obsidian's listSections), but warn since
  // replace will silently target the first occurrence.
  const dupes = sections.filter((s, i) => sections.indexOf(s) !== i);
  if (dupes.length > 0) {
    console.warn(
      `[ai2stock] Notion: page has duplicate heading(s): ${[...new Set(dupes)].join(', ')}. --section will target the first occurrence.`,
    );
  }
  return sections;
}

export async function replaceNotionAtomSection(
  cfg: NotionConfig,
  pageId: string,
  sectionTitle: string,
  content: string,
  tokenEnvOverride?: string,
): Promise<void> {
  if (!sectionTitle || !sectionTitle.trim()) {
    throw new Error('Section title must be a non-empty string.');
  }
  const client = getClient(cfg, tokenEnvOverride);
  const all = await fetchAllChildren(client, pageId);

  const headingIdx = all.findIndex((b) => headingText(b) === sectionTitle);
  if (headingIdx === -1) {
    throw new Error(`Section not found: ${sectionTitle}`);
  }
  const heading = all[headingIdx];
  const level = headingLevel(heading)!;

  // Section ends at the next heading whose level is same-or-higher (lower number).
  let endIdx = all.length;
  for (let i = headingIdx + 1; i < all.length; i++) {
    const lv = headingLevel(all[i]);
    if (lv !== null && lv <= level) {
      endIdx = i;
      break;
    }
  }
  const bodyIds = all.slice(headingIdx + 1, endIdx).map((b) => b.id);

  await deleteBlocksOrAbort(client, bodyIds, 'section replace');

  const newBlocks = buildBlocks(content);
  if (newBlocks.length === 0) return;
  await client.blocks.children.append({
    block_id: pageId,
    after: heading.id,
    children: newBlocks as never,
  } as never);
}

export async function archiveNotionAtom(
  cfg: NotionConfig,
  pageId: string,
  tokenEnvOverride?: string,
): Promise<void> {
  const client = getClient(cfg, tokenEnvOverride);

  // Defense-in-depth: verify pageId is in the configured tree.
  //   - workspace-top-level mode (cfg.parent_page_id absent):
  //       workspace > session > atom
  //   - constrained mode (cfg.parent_page_id set):
  //       parent_page_id > session > atom (v0.5.1+) OR
  //       parent_page_id > atom (legacy v0.5.0 flat)
  // Prevents accidental archive of arbitrary pages the integration can reach.
  const cfgNorm = cfg.parent_page_id ? normalizeNotionId(cfg.parent_page_id) : '';
  try {
    const page = await client.pages.retrieve({ page_id: pageId });
    const parent = (page as { parent?: { type?: string; page_id?: string } }).parent;
    if (parent?.type !== 'page_id' || !parent.page_id) {
      throw new Error(
        `Refusing to archive page outside configured parent. page parent type=${parent?.type ?? 'unknown'}`,
      );
    }
    if (cfgNorm && normalizeNotionId(parent.page_id) === cfgNorm) {
      // legacy v0.5.0 flat atom — accept.
    } else {
      const sessionPage = await client.pages.retrieve({ page_id: parent.page_id });
      const grand = (sessionPage as { parent?: { type?: string; page_id?: string } }).parent;
      if (cfgNorm) {
        const grandNorm = normalizeNotionId(grand?.page_id ?? '');
        if (grand?.type !== 'page_id' || grandNorm !== cfgNorm) {
          throw new Error(
            `Refusing to archive page outside configured parent. session parent=${grand?.page_id ?? ''}, expected=${cfg.parent_page_id}`,
          );
        }
      } else {
        if (grand?.type !== 'workspace') {
          throw new Error(
            `Refusing to archive page outside workspace top level. session parent type=${grand?.type ?? 'unknown'}`,
          );
        }
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

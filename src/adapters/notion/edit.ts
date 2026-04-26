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
  if (!cfg.database_id) throw new Error('Notion database_id is not configured');
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

export async function findNotionAtomById(
  cfg: NotionConfig,
  id: string,
  tokenEnvOverride?: string,
): Promise<NotionAtomRef | null> {
  const client = getClient(cfg, tokenEnvOverride);
  const response = await client.databases.query({
    database_id: cfg.database_id,
    filter: {
      property: 'Title',
      title: { equals: id },
    } as never,
    page_size: 1,
  });

  const results = (response as { results: Array<{ id: string; url?: string }> }).results;
  if (results.length === 0) return null;
  const page = results[0];
  const url = page.url ?? `https://www.notion.so/${page.id.replace(/-/g, '')}`;
  return { pageId: page.id, title: id, url };
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

  // 1. List existing children (paginated)
  const existingIds: string[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 20; i++) {
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
  }

  // 2. Delete each existing block (Notion has no bulk delete)
  for (const blockId of existingIds) {
    try {
      await client.blocks.delete({ block_id: blockId });
    } catch (e) {
      console.warn(`[ai2stock] Notion: failed to delete block ${blockId}: ${(e as Error).message}`);
    }
  }

  // 3. Append new blocks
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
  await client.pages.update({
    page_id: pageId,
    archived: true,
  });
}

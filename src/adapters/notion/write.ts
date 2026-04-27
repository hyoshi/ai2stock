import { Client } from '@notionhq/client';
import type { Atom, NotionConfig } from '../../core/types.js';
import { buildBlocks } from './blocks.js';
import { sanitizeSessionName } from '../../core/session.js';

export interface NotionWriteResult {
  pageId: string;
  url: string;
}

// In-memory cache: parent_page_id + sessionName → sessionPageId.
// Avoids repeating the search/create round trip within a single CLI process.
const sessionPageCache = new Map<string, string>();
// In-flight map: prevents concurrent calls from racing each other into
// double-creates of the same session sub-page. (Process-local; cache lifetime
// is the CLI process; if cfg.parent_page_id is reassigned mid-process the
// cached id may be stale — known limitation, low likelihood.)
const sessionPageInFlight = new Map<string, Promise<string>>();

export function _resetSessionPageCache(): void {
  sessionPageCache.clear();
  sessionPageInFlight.clear();
}

function cacheKey(parentPageId: string, sessionName: string): string {
  return `${parentPageId}::${sessionName}`;
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

async function ensureSessionPage(
  client: Client,
  cfg: NotionConfig,
  sessionName: string,
): Promise<string> {
  const safeName = sanitizeSessionName(sessionName) || 'untitled-session';
  const key = cacheKey(cfg.parent_page_id, safeName);
  const cached = sessionPageCache.get(key);
  if (cached) return cached;
  const inFlight = sessionPageInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    // Search for existing session page with matching title under parent_page_id.
    const response = await client.search({
      query: safeName,
      filter: { property: 'object', value: 'page' },
      page_size: 100,
    });
    const results = (response as { results: Array<{ id: string; parent?: { type?: string; page_id?: string } }> }).results;
    const cfgParent = normalizeNotionId(cfg.parent_page_id);
    for (const page of results) {
      if (extractPlainTitle(page) !== safeName) continue;
      if (page.parent?.type !== 'page_id') continue;
      if (normalizeNotionId(page.parent.page_id ?? '') !== cfgParent) continue;
      sessionPageCache.set(key, page.id);
      return page.id;
    }
    // Not found: create a new session sub-page under parent_page_id.
    const created = await client.pages.create({
      parent: { page_id: cfg.parent_page_id },
      properties: {
        title: { title: [{ type: 'text', text: { content: safeName } }] },
      } as never,
    });
    const newId = (created as { id: string }).id;
    sessionPageCache.set(key, newId);
    return newId;
  })();

  sessionPageInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    sessionPageInFlight.delete(key);
  }
}

export async function writeAtomToNotion(
  atom: Atom,
  cfg: NotionConfig,
  tokenEnvOverride?: string,
): Promise<NotionWriteResult> {
  if (!cfg.enabled) {
    throw new Error('Notion adapter is disabled');
  }
  if (!cfg.parent_page_id) {
    throw new Error('Notion parent_page_id is not configured');
  }

  const tokenEnv = tokenEnvOverride ?? cfg.token_env ?? 'NOTION_TOKEN';
  const token = process.env[tokenEnv];
  if (!token) {
    throw new Error(
      `Notion token not found in env: ${tokenEnv}. ` +
        `Set ${tokenEnv}=secret_xxx in your shell or .env`,
    );
  }

  const client = new Client({ auth: token });

  const sessionName = atom.frontmatter.session_name?.trim() || 'untitled-session';
  const sessionPageId = await ensureSessionPage(client, cfg, sessionName);

  const properties = {
    title: {
      title: [{ type: 'text', text: { content: atom.frontmatter.id } }],
    },
  };

  const children = [buildFrontmatterCallout(atom), ...buildBlocks(atom.body)];

  // SDK uses ultra-strict discriminated unions; runtime-built shapes need cast.
  const response = await client.pages.create({
    parent: { page_id: sessionPageId },
    properties: properties as never,
    children: children as never,
  });

  const pageId = (response as { id: string }).id;
  const url = (response as { url?: string }).url ?? `https://www.notion.so/${pageId.replace(/-/g, '')}`;
  return { pageId, url };
}

export function buildFrontmatterCallout(atom: Atom): Record<string, unknown> {
  const fm = atom.frontmatter;
  const lines: string[] = [];
  lines.push(`id: ${fm.id}`);
  if (fm.type) lines.push(`type: ${fm.type}`);
  if (fm.project) lines.push(`project: ${fm.project}`);
  if (fm.session_name) lines.push(`session: ${fm.session_name}`);
  if (fm.tags && fm.tags.length > 0) lines.push(`tags: ${fm.tags.join(', ')}`);
  if (fm.confidence) lines.push(`confidence: ${fm.confidence}`);
  if (fm.created) lines.push(`created: ${fm.created}`);
  if (fm.updated) lines.push(`updated: ${fm.updated}`);
  if (typeof fm['ai-generated'] === 'boolean') lines.push(`ai-generated: ${fm['ai-generated']}`);

  return {
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '📝' },
      color: 'gray_background',
      rich_text: [{ type: 'text', text: { content: lines.join('\n') } }],
    },
  };
}

import { Client } from '@notionhq/client';
import type { Atom, NotionConfig } from '../../core/types.js';
import { buildBlocks } from './blocks.js';

export interface NotionWriteResult {
  pageId: string;
  url: string;
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

  const properties = {
    title: {
      title: [{ type: 'text', text: { content: atom.frontmatter.id } }],
    },
  };

  const children = [buildFrontmatterCallout(atom), ...buildBlocks(atom.body)];

  // SDK uses ultra-strict discriminated unions; runtime-built shapes need cast.
  const response = await client.pages.create({
    parent: { page_id: cfg.parent_page_id },
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

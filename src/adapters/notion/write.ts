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
  if (!cfg.database_id) {
    throw new Error('Notion database_id is not configured');
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

  const properties = buildProperties(atom);
  const children = buildBlocks(atom.body);

  // The Notion SDK has very strict typed property/block schemas; we build
  // properties/blocks dynamically from frontmatter, so cast to the SDK types here.
  const response = await client.pages.create({
    parent: { database_id: cfg.database_id },
    properties: properties as never,
    children: children as never,
  });

  const pageId = (response as { id: string }).id;
  const url = (response as { url?: string }).url ?? `https://www.notion.so/${pageId.replace(/-/g, '')}`;
  return { pageId, url };
}

function buildProperties(atom: Atom): Record<string, unknown> {
  const fm = atom.frontmatter;
  const props: Record<string, unknown> = {
    Title: {
      title: [{ type: 'text', text: { content: fm.id } }],
    },
  };

  if (fm.type) {
    props.Type = { select: { name: fm.type } };
  }
  if (fm.tags && fm.tags.length > 0) {
    props.Tags = { multi_select: fm.tags.slice(0, 100).map((t) => ({ name: t })) };
  }
  if (fm.project) {
    props.Project = { select: { name: fm.project } };
  }
  if (fm.session_name) {
    props.Session = { rich_text: [{ type: 'text', text: { content: fm.session_name } }] };
  }
  if (fm.created) {
    props.Created = { date: { start: fm.created } };
  }
  if (typeof fm['ai-generated'] === 'boolean') {
    props['AI-Generated'] = { checkbox: fm['ai-generated'] };
  }
  if (fm.confidence) {
    props.Confidence = { select: { name: fm.confidence } };
  }
  return props;
}

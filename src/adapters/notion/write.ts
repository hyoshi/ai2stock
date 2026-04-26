import { Client } from '@notionhq/client';
import type { Atom, NotionConfig } from '../../core/types.js';

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
  // properties/blocks dynamically from frontmatter, so cast to any here.
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

const MAX_BLOCK_TEXT = 2000;

function buildBlocks(body: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const lines = body.split('\n');

  let codeBuf: string[] | null = null;
  let codeLang = '';

  for (const line of lines) {
    if (codeBuf !== null) {
      if (line.trim().startsWith('```')) {
        blocks.push(codeBlock(codeBuf.join('\n'), codeLang));
        codeBuf = null;
        codeLang = '';
        continue;
      }
      codeBuf.push(line);
      continue;
    }

    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      codeBuf = [];
      codeLang = fenceMatch[1] || 'plain text';
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { blocks.push(heading(1, h1[1])); continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { blocks.push(heading(2, h2[1])); continue; }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { blocks.push(heading(3, h3[1])); continue; }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { blocks.push(quoteBlock(quote[1])); continue; }

    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) { blocks.push(bulletBlock(li[1])); continue; }

    if (line.trim() === '') continue;

    blocks.push(paragraphBlock(line));
  }

  if (codeBuf !== null) {
    blocks.push(codeBlock(codeBuf.join('\n'), codeLang));
  }

  return blocks.slice(0, 100);
}

function richText(content: string): Array<Record<string, unknown>> {
  const safe = content.length > MAX_BLOCK_TEXT ? content.slice(0, MAX_BLOCK_TEXT - 1) + '…' : content;
  return [{ type: 'text', text: { content: safe } }];
}

function paragraphBlock(text: string): Record<string, unknown> {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text) } };
}

function heading(level: 1 | 2 | 3, text: string): Record<string, unknown> {
  const key = `heading_${level}` as const;
  return { object: 'block', type: key, [key]: { rich_text: richText(text) } };
}

function bulletBlock(text: string): Record<string, unknown> {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(text) } };
}

function quoteBlock(text: string): Record<string, unknown> {
  return { object: 'block', type: 'quote', quote: { rich_text: richText(text) } };
}

function codeBlock(text: string, language: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: richText(text),
      language: normalizeLang(language),
    },
  };
}

const NOTION_LANGS = new Set([
  'abap', 'arduino', 'bash', 'basic', 'c', 'clojure', 'coffeescript', 'c++', 'c#',
  'css', 'dart', 'diff', 'docker', 'elixir', 'elm', 'erlang', 'flow', 'fortran',
  'f#', 'gherkin', 'glsl', 'go', 'graphql', 'groovy', 'haskell', 'html', 'java',
  'javascript', 'json', 'julia', 'kotlin', 'latex', 'less', 'lisp', 'livescript',
  'lua', 'makefile', 'markdown', 'markup', 'matlab', 'mermaid', 'nix',
  'objective-c', 'ocaml', 'pascal', 'perl', 'php', 'plain text', 'powershell',
  'prolog', 'protobuf', 'python', 'r', 'reason', 'ruby', 'rust', 'sass', 'scala',
  'scheme', 'scss', 'shell', 'solidity', 'sql', 'swift', 'typescript', 'vb.net',
  'verilog', 'vhdl', 'visual basic', 'webassembly', 'xml', 'yaml', 'java/c/c++/c#',
]);

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  if (NOTION_LANGS.has(lower)) return lower;
  if (lower === 'sh' || lower === 'zsh') return 'shell';
  if (lower === 'ts') return 'typescript';
  if (lower === 'js') return 'javascript';
  if (lower === 'py') return 'python';
  return 'plain text';
}

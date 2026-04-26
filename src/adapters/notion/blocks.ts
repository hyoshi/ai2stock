const MAX_BLOCK_TEXT = 2000;
const MAX_BLOCKS = 100;

export function buildBlocks(body: string): Array<Record<string, unknown>> {
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
    if (h1) { blocks.push(heading(1, h1[1].trim())); continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { blocks.push(heading(2, h2[1].trim())); continue; }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { blocks.push(heading(3, h3[1].trim())); continue; }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const text = quote[1].trim();
      if (text) blocks.push(quoteBlock(text));
      continue;
    }

    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) { blocks.push(bulletBlock(li[1])); continue; }

    if (line.trim() === '') continue;

    blocks.push(paragraphBlock(line));
  }

  if (codeBuf !== null) {
    blocks.push(codeBlock(codeBuf.join('\n') || ' ', codeLang));
  }

  if (blocks.length > MAX_BLOCKS) {
    const dropped = blocks.length - (MAX_BLOCKS - 1);
    console.warn(`[ai2stock] Notion: body has ${blocks.length} blocks, truncating to ${MAX_BLOCKS} (${dropped} dropped). Notion's API limit is 100 child blocks per page.`);
    return [
      ...blocks.slice(0, MAX_BLOCKS - 1),
      paragraphBlock(`[truncated: ${dropped} more blocks omitted; full content remains in Obsidian]`),
    ];
  }
  return blocks;
}

export function richText(content: string): Array<Record<string, unknown>> {
  if (content.length > MAX_BLOCK_TEXT) {
    console.warn(`[ai2stock] Notion: truncating block text from ${content.length} to ${MAX_BLOCK_TEXT} chars (Notion API limit per rich_text element).`);
    return [{ type: 'text', text: { content: content.slice(0, MAX_BLOCK_TEXT - 1) + '…' } }];
  }
  return [{ type: 'text', text: { content } }];
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
      rich_text: richText(text || ' '),
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

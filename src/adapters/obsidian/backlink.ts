import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import type { AtomFrontmatter, ObsidianConfig } from '../../core/types.js';
import { isValidAtomFrontmatter } from '../../core/frontmatter.js';

export interface RelatedAtomRef {
  filePath: string;
  frontmatter: AtomFrontmatter;
}

export function findRelatedAtoms(
  tags: string[],
  cfg: ObsidianConfig,
  excludeId: string,
  limit = 20,
): RelatedAtomRef[] {
  if (tags.length === 0) return [];
  if (!fs.existsSync(cfg.vault_path)) return [];

  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const atomsDir = path.join(cfg.vault_path, cfg.folders.atoms);
  if (!fs.existsSync(atomsDir)) return [];

  const files = fg.sync('**/*.md', { cwd: atomsDir, absolute: true });
  const matches: RelatedAtomRef[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = matter(raw);
      if (!isValidAtomFrontmatter(parsed.data)) continue;
      const fm: AtomFrontmatter = parsed.data;
      if (fm.id === excludeId) continue;

      const fmTags = (fm.tags || []).map((t) => String(t).toLowerCase());
      const overlap = fmTags.some((t) => tagSet.has(t));
      if (overlap) {
        matches.push({ filePath: file, frontmatter: fm });
      }
      if (matches.length >= limit) break;
    } catch {
      // skip unreadable file
    }
  }

  return matches;
}

const RELATED_HEADING = '## Related';

export function insertBacklinks(targets: RelatedAtomRef[], newAtomId: string): void {
  const linkLine = `- [[${newAtomId}]]`;

  for (const t of targets) {
    let content = fs.readFileSync(t.filePath, 'utf8');

    if (content.includes(`[[${newAtomId}]]`)) {
      continue;
    }

    if (content.includes(RELATED_HEADING)) {
      content = appendInRelatedSection(content, linkLine);
    } else {
      const trimmed = content.endsWith('\n') ? content : content + '\n';
      content = `${trimmed}\n${RELATED_HEADING}\n\n${linkLine}\n`;
    }
    fs.writeFileSync(t.filePath, content, 'utf8');
  }
}

function appendInRelatedSection(content: string, linkLine: string): string {
  const lines = content.split('\n');
  let inSection = false;
  let lastListIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === RELATED_HEADING) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (lines[i].startsWith('## ') || lines[i].startsWith('# ')) {
        break;
      }
      if (lines[i].startsWith('- ')) {
        lastListIdx = i;
      }
    }
  }
  if (lastListIdx >= 0) {
    lines.splice(lastListIdx + 1, 0, linkLine);
  } else {
    lines.push(linkLine);
  }
  return lines.join('\n');
}

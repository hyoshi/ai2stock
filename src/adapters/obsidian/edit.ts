import fs from 'node:fs';
import matter from 'gray-matter';
import type { AtomFrontmatter } from '../../core/types.js';
import { formatIso, isValidAtomFrontmatter, serializeAtom } from '../../core/frontmatter.js';

function readAtom(filePath: string): { fm: AtomFrontmatter; body: string } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Atom file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  if (!isValidAtomFrontmatter(parsed.data)) {
    throw new Error(`Atom frontmatter is invalid: ${filePath}`);
  }
  return { fm: parsed.data, body: parsed.content };
}

function writeAtomFile(filePath: string, fm: AtomFrontmatter, body: string): void {
  const text = serializeAtom(fm, body);
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, text, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw new Error(`Failed to write atom to ${filePath}: ${(e as Error).message}`);
  }
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function formatHumanTimestamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function appendToAtom(filePath: string, newContent: string, now: Date = new Date()): void {
  const { fm, body } = readAtom(filePath);
  const trimmedBody = body.replace(/\s+$/, '');
  const heading = `## ${formatHumanTimestamp(now)} 追記`;
  const newBody = `${trimmedBody}\n\n${heading}\n\n${newContent.trim()}\n`;
  fm.updated = formatIso(now);
  writeAtomFile(filePath, fm, newBody);
}

export function replaceAtomBody(filePath: string, newContent: string, now: Date = new Date()): void {
  const { fm } = readAtom(filePath);
  fm.updated = formatIso(now);
  writeAtomFile(filePath, fm, `${newContent.trim()}\n`);
}

export function listSections(filePath: string): string[] {
  const { body } = readAtom(filePath);
  const lines = body.split('\n');
  const sections: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^##\s+(.+)$/);
    if (m) sections.push(m[1].trim());
  }
  return sections;
}

export function replaceSection(
  filePath: string,
  sectionTitle: string,
  newContent: string,
  now: Date = new Date(),
): void {
  const { fm, body } = readAtom(filePath);
  const lines = body.split('\n');
  const target = sectionTitle.trim();

  let inFence = false;
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      const heading = m[1].trim();
      if (startIdx === -1 && heading === target) {
        startIdx = i;
      } else if (startIdx !== -1) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) {
    throw new Error(`Section not found: ${sectionTitle}`);
  }

  const before = lines.slice(0, startIdx + 1);
  const after = lines.slice(endIdx);
  const newSection = ['', newContent.trim(), ''];
  const newLines = [...before, ...newSection, ...after];

  fm.updated = formatIso(now);
  writeAtomFile(filePath, fm, newLines.join('\n'));
}

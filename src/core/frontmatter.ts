import matter from 'gray-matter';
import type { Atom, AtomFrontmatter, AtomType, Confidence } from './types.js';

const MAX_ID_LEN = 80;

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTimeHHMM(d: Date): string {
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function tzOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = pad2(Math.floor(Math.abs(off) / 60));
  const mm = pad2(Math.abs(off) % 60);
  return `${sign}${hh}:${mm}`;
}

export function formatIso(d: Date): string {
  const date = formatDateLocal(d);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${date}T${time}${tzOffset(d)}`;
}

export function slugify(title: string): string {
  const asciiLetters = (title.match(/[a-zA-Z]/g) || []).length;
  const totalNonSpace = title.replace(/\s/g, '').length;

  if (totalNonSpace === 0) return '';
  if (asciiLetters / totalNonSpace < 0.3) return '';

  return title
    .toLowerCase()
    .replace(/[^\x00-\x7f]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function generateId(title: string, now: Date = new Date()): string {
  const date = formatDateLocal(now);
  const time = formatTimeHHMM(now);
  const slug = slugify(title) || 'untitled';
  const id = `${date}-${time}-${slug}`;
  return id.length > MAX_ID_LEN ? id.slice(0, MAX_ID_LEN) : id;
}

export interface BuildFrontmatterInput {
  title: string;
  type: AtomType;
  content: string;
  tags?: string[];
  project?: string;
  source?: string;
  session?: string;
  confidence?: Confidence;
  aiGenerated?: boolean;
  now?: Date;
}

export function buildFrontmatter(input: BuildFrontmatterInput): AtomFrontmatter {
  const now = input.now ?? new Date();
  const fm: AtomFrontmatter = {
    id: generateId(input.title, now),
    type: input.type,
    created: formatIso(now),
    'ai-generated': input.aiGenerated ?? true,
  };
  if (input.tags && input.tags.length > 0) {
    fm.tags = [...new Set(input.tags.map((t) => t.toLowerCase()))];
  }
  if (input.project) fm.project = input.project;
  if (input.source) fm.source = input.source;
  if (input.session) fm.session = input.session;
  if (input.confidence) fm.confidence = input.confidence;
  return fm;
}

export function serializeAtom(frontmatter: AtomFrontmatter, body: string): string {
  return matter.stringify(body, frontmatter as unknown as Record<string, unknown>);
}

export function isValidAtomFrontmatter(d: unknown): d is AtomFrontmatter {
  if (!d || typeof d !== 'object') return false;
  const fm = d as Record<string, unknown>;
  if (typeof fm.id !== 'string' || fm.id.length === 0) return false;
  if (typeof fm.type !== 'string') return false;
  if (!['decision', 'snippet', 'learning', 'reference'].includes(fm.type)) return false;
  if (fm.tags !== undefined && !Array.isArray(fm.tags)) return false;
  if (fm.related !== undefined && !Array.isArray(fm.related)) return false;
  return true;
}

export function parseAtom(text: string): Atom {
  const parsed = matter(text);
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    throw new Error('Atom file is missing frontmatter');
  }
  if (!isValidAtomFrontmatter(parsed.data)) {
    throw new Error('Atom frontmatter is invalid (missing required fields or wrong types)');
  }
  const fm = parsed.data;
  return {
    frontmatter: fm,
    title: extractTitleFromBody(parsed.content) || fm.id,
    body: parsed.content,
  };
}

function extractTitleFromBody(body: string): string | null {
  const m = body.match(/^#+\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

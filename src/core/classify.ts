import type { AtomType } from './types.js';

const DECISION_PATTERNS = [
  /\b(decide|decision|conclude|chosen|chose)\b/i,
  /(決定|確定|採用|不採用|方針)/,
];

const SNIPPET_PATTERNS = [
  /\$\s+\w+/m,
  /\b(npm|yarn|pnpm|brew|git|docker|curl)\s+\w+/,
];

const REFERENCE_PATTERNS = [/\b(see|reference|参考|参照|公式|documentation|docs at)\b/i];

const LEARNING_PATTERNS = [
  /\b(learn|insight|TIL|lesson|pattern|antipattern)\b/i,
  /(気づき|わかった|発見|罠|ハマった|理由)/,
];

export function classify(content: string): AtomType {
  const codeBlocks = content.match(/```[\s\S]+?```/g) || [];
  const codeChars = codeBlocks.reduce((sum, block) => sum + block.length, 0);
  const codeRatio = content.length > 0 ? codeChars / content.length : 0;

  if (codeBlocks.length >= 1 && codeRatio > 0.3) {
    return 'snippet';
  }

  const scores: Record<AtomType, number> = {
    decision: 0,
    snippet: 0,
    learning: 0,
    reference: 0,
  };

  for (const p of DECISION_PATTERNS) if (p.test(content)) scores.decision += 2;
  for (const p of SNIPPET_PATTERNS) if (p.test(content)) scores.snippet += 1;
  for (const p of REFERENCE_PATTERNS) if (p.test(content)) scores.reference += 1;
  for (const p of LEARNING_PATTERNS) if (p.test(content)) scores.learning += 2;

  const urls = (content.match(/https?:\/\/\S+/g) || []).length;
  if (urls >= 3) scores.reference += 3;
  else if (urls >= 1) scores.reference += 1;

  let best: AtomType = 'learning';
  let bestScore = 0;
  for (const k of Object.keys(scores) as AtomType[]) {
    if (scores[k] > bestScore) {
      best = k;
      bestScore = scores[k];
    }
  }

  return best;
}

export function extractTitle(content: string, maxLen = 80): string {
  const firstHeading = content.match(/^#+\s+(.+)$/m);
  if (firstHeading) return truncate(firstHeading[1].trim(), maxLen);

  const firstNonEmpty = content.split('\n').find((l) => l.trim().length > 0);
  if (firstNonEmpty) {
    const cleaned = firstNonEmpty.replace(/^[#*\->`\s]+/, '').trim();
    if (cleaned.length > 0) return truncate(cleaned, maxLen);
  }

  return 'Untitled Atom';
}

export function extractTags(content: string, existingTags: string[] = []): string[] {
  const hashtags = (content.match(/(?<![\w/])#([a-zA-Z0-9_-]+)/g) || [])
    .map((t) => t.slice(1).toLowerCase())
    .filter((t) => !/^\d+$/.test(t));

  const lowered = existingTags.map((t) => t.toLowerCase());
  const combined: string[] = [];
  const seen = new Set<string>();
  for (const t of [...lowered, ...hashtags]) {
    if (!seen.has(t)) {
      seen.add(t);
      combined.push(t);
    }
  }
  return combined.slice(0, 10);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

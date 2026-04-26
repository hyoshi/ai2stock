import type { Atom, AtomType, Confidence } from './types.js';
import { classify, extractTitle, extractTags } from './classify.js';
import { buildFrontmatter } from './frontmatter.js';
import { detectSessionInfo } from './session.js';

export interface IntermediateDefaults {
  source: string;
  confidence: Confidence;
  defaultProject?: string;
}

export interface BuildAtomInput {
  content: string;
  type?: AtomType;
  tags?: string[];
  project?: string;
  source?: string;
  session?: string;
  sessionName?: string;
  sessionDir?: string;
  confidence?: Confidence;
  title?: string;
  now?: Date;
  defaults: IntermediateDefaults;
}

export function buildAtomFromInput(input: BuildAtomInput): Atom {
  const now = input.now ?? new Date();
  const type: AtomType = input.type ?? classify(input.content);
  const title = input.title ?? extractTitle(input.content);
  const tags = extractTags(input.content, input.tags ?? []);

  const sess = (input.sessionName && input.sessionDir)
    ? { name: input.sessionName, sessionId: input.session ?? null, sessionDir: input.sessionDir }
    : detectSessionInfo();

  const fm = buildFrontmatter({
    title,
    type,
    content: input.content,
    tags: tags.length > 0 ? tags : undefined,
    project: input.project ?? input.defaults.defaultProject,
    source: input.source ?? input.defaults.source,
    session: input.session ?? sess.sessionId ?? undefined,
    sessionName: sess.name,
    sessionDir: sess.sessionDir,
    confidence: input.confidence ?? input.defaults.confidence,
    now,
  });

  const sessionHeader = renderSessionHeader(sess.name, sess.sessionDir, now);
  const trimmedContent = input.content.trim();
  const body = `${sessionHeader}\n\n${trimmedContent}`;

  return {
    frontmatter: fm,
    title,
    body,
  };
}

function renderSessionHeader(name: string, dir: string, now: Date): string {
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return [
    `> **Session**: ${name}`,
    `> **Date**: ${dateStr}`,
    `> **Worktree**: ${dir}`,
  ].join('\n');
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

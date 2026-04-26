import type { Atom, AtomType, Confidence } from './types.js';
import { classify, extractTitle, extractTags } from './classify.js';
import { buildFrontmatter } from './frontmatter.js';

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

  const fm = buildFrontmatter({
    title,
    type,
    content: input.content,
    tags: tags.length > 0 ? tags : undefined,
    project: input.project ?? input.defaults.defaultProject,
    source: input.source ?? input.defaults.source,
    session: input.session,
    confidence: input.confidence ?? input.defaults.confidence,
    now,
  });

  return {
    frontmatter: fm,
    title,
    body: input.content.trim(),
  };
}

export type AtomType = 'decision' | 'snippet' | 'learning' | 'reference';

export type Confidence = 'high' | 'medium' | 'low';

export interface AtomFrontmatter {
  id: string;
  type: AtomType;
  created: string;
  'ai-generated': boolean;
  project?: string;
  tags?: string[];
  session?: string;
  session_name?: string;
  session_dir?: string;
  source?: string;
  confidence?: Confidence;
  status?: 'draft' | 'reviewed' | 'archived';
  related?: string[];
  updated?: string;
}

export interface Atom {
  frontmatter: AtomFrontmatter;
  title: string;
  body: string;
}

export interface ObsidianFolders {
  atoms: string;
  sessions: string;
  moc: string;
}

export interface ObsidianConfig {
  enabled: boolean;
  vault_path: string;
  folders: ObsidianFolders;
}

export interface ConfigDefaults {
  source: string;
  confidence: Confidence;
  primary_search_adapter: string;
  write_strategy: 'all' | 'primary_only' | 'sequential';
  default_project?: string;
}

export interface Config {
  version: number;
  adapters: string[];
  obsidian: ObsidianConfig;
  defaults: ConfigDefaults;
}

export interface AddOptions {
  content: string;
  type?: AtomType;
  tags?: string[];
  project?: string;
  confidence?: Confidence;
  dryRun?: boolean;
  to?: string[];
  title?: string;
  source?: string;
  session?: string;
}

export interface WriteResult {
  filePath: string;
  relativePath: string;
  related: string[];
  mocUpdated: boolean;
}

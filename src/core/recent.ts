import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG_DIR } from './config.js';

const RECENT_PATH = path.join(DEFAULT_CONFIG_DIR, 'recent.json');
const MAX_HISTORY = 10;

export interface RecentEntry {
  id: string;
  filePath: string;
  type: string;
  title: string;
  project?: string;
  tags?: string[];
  created: string;
}

export interface RecentState {
  last_added: RecentEntry | null;
  history: RecentEntry[];
}

export function loadRecent(): RecentState {
  if (!fs.existsSync(RECENT_PATH)) {
    return { last_added: null, history: [] };
  }
  try {
    const raw = fs.readFileSync(RECENT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { last_added: null, history: [] };
    }
    return {
      last_added: isValidEntry(parsed.last_added) ? parsed.last_added : null,
      history: Array.isArray(parsed.history) ? parsed.history.filter(isValidEntry) : [],
    };
  } catch {
    return { last_added: null, history: [] };
  }
}

export function saveRecent(state: RecentState): void {
  fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(RECENT_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export function recordAdd(entry: RecentEntry): void {
  const state = loadRecent();
  const dedupedHistory = [entry, ...state.history.filter((e) => e.id !== entry.id)].slice(0, MAX_HISTORY);
  saveRecent({ last_added: entry, history: dedupedHistory });
}

export function getLastAdded(): RecentEntry | null {
  return loadRecent().last_added;
}

export function getRecentList(limit = MAX_HISTORY): RecentEntry[] {
  return loadRecent().history.slice(0, limit);
}

function isValidEntry(e: unknown): e is RecentEntry {
  if (!e || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.filePath === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.created === 'string'
  );
}

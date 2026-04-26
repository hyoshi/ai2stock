import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SessionInfo {
  name: string;
  sessionId: string | null;
  sessionDir: string;
}

interface SessionMeta {
  sessionId?: string;
  cwd?: string;
  name?: string;
  updatedAt?: number;
}

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

export function detectSessionInfo(cwd: string = process.cwd()): SessionInfo {
  const meta = findSessionMetaForCwd(cwd);
  const name = meta?.name?.trim() || cwdBasename(meta?.cwd || cwd) || shortId(meta?.sessionId);
  return {
    name,
    sessionId: meta?.sessionId || null,
    sessionDir: meta?.cwd || cwd,
  };
}

function findSessionMetaForCwd(cwd: string): SessionMeta | null {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const target = path.resolve(cwd);

  let best: SessionMeta | null = null;
  let bestUpdated = 0;
  let bestMatchLen = 0;

  for (const f of safeReaddir(SESSIONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const data = safeReadJson(path.join(SESSIONS_DIR, f));
    if (!data || typeof data.cwd !== 'string') continue;

    const candidateCwd = path.resolve(data.cwd);
    if (target === candidateCwd || target.startsWith(candidateCwd + path.sep)) {
      const matchLen = candidateCwd.length;
      const updated = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
      if (matchLen > bestMatchLen || (matchLen === bestMatchLen && updated > bestUpdated)) {
        best = data;
        bestUpdated = updated;
        bestMatchLen = matchLen;
      }
    }
  }
  return best;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function safeReadJson(p: string): SessionMeta | null {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

function cwdBasename(cwd: string | undefined): string {
  if (!cwd) return '';
  return path.basename(path.resolve(cwd)) || '';
}

function shortId(id?: string | null): string {
  if (!id) return 'untitled-session';
  return `session-${id.slice(0, 8)}`;
}

export function sanitizeSessionName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'untitled-session';
  const cleaned = trimmed
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\.+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 60) || 'untitled-session';
}

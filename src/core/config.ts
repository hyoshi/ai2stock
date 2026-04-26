import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import type { Config } from './types.js';

export const DEFAULT_CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'ai2stock',
);
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_CONFIG_DIR, 'config.yml');

export const DEFAULT_CONFIG: Config = {
  version: 1,
  adapters: ['obsidian'],
  obsidian: {
    enabled: true,
    vault_path: '',
    folders: {
      atoms: '10-Atoms',
      sessions: '20-Sessions',
      moc: '00-MOC',
    },
  },
  defaults: {
    source: 'claude-code',
    confidence: 'medium',
    primary_search_adapter: 'obsidian',
    write_strategy: 'all',
  },
};

export function loadConfig(configPath: string = DEFAULT_CONFIG_PATH): Config {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config not found at ${configPath}. Run 'ai2stock init' to create one.`,
    );
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config at ${configPath}: not a YAML object`);
  }
  return mergeWithDefaults(parsed as Partial<Config>);
}

export function saveConfig(cfg: Config, configPath: string = DEFAULT_CONFIG_PATH): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const text = yaml.dump(cfg, { lineWidth: 100, noRefs: true });
  fs.writeFileSync(configPath, text, 'utf8');
}

export function configExists(configPath: string = DEFAULT_CONFIG_PATH): boolean {
  return fs.existsSync(configPath);
}

function mergeWithDefaults(partial: Partial<Config>): Config {
  return {
    version: partial.version ?? DEFAULT_CONFIG.version,
    adapters: partial.adapters ?? DEFAULT_CONFIG.adapters,
    obsidian: {
      ...DEFAULT_CONFIG.obsidian,
      ...(partial.obsidian ?? {}),
      folders: {
        ...DEFAULT_CONFIG.obsidian.folders,
        ...((partial.obsidian?.folders as Partial<typeof DEFAULT_CONFIG.obsidian.folders>) ?? {}),
      },
    },
    defaults: {
      ...DEFAULT_CONFIG.defaults,
      ...(partial.defaults ?? {}),
    },
  };
}

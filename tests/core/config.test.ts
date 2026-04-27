import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../../src/core/config.js';

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai2stock-cfg-'));
  configPath = path.join(tmpDir, 'config.yml');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeCfg(yaml: string): void {
  fs.writeFileSync(configPath, yaml, 'utf8');
}

describe('loadConfig', () => {
  it('loads a valid pages-mode config', () => {
    writeCfg(`
version: 1
adapters: [obsidian, notion]
obsidian:
  enabled: true
  vault_path: /tmp/vault
notion:
  enabled: true
  token_env: NOTION_TOKEN
  parent_page_id: abc123def456
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  primary_search_adapter: obsidian
  write_strategy: primary_only
`);
    const cfg = loadConfig(configPath);
    expect(cfg.notion?.parent_page_id).toBe('abc123def456');
    expect(cfg.notion?.enabled).toBe(true);
  });

  it('throws migration error when legacy database_id is present without parent_page_id', () => {
    writeCfg(`
version: 1
adapters: [obsidian, notion]
obsidian:
  enabled: true
  vault_path: /tmp/vault
notion:
  enabled: true
  token_env: NOTION_TOKEN
  database_id: old-db-id-xxx
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  primary_search_adapter: obsidian
  write_strategy: primary_only
`);
    expect(() => loadConfig(configPath)).toThrow(/legacy `database_id`/);
    expect(() => loadConfig(configPath)).toThrow(/parent_page_id/);
  });

  it('does NOT throw when both database_id and parent_page_id present (parent_page_id wins)', () => {
    writeCfg(`
version: 1
adapters: [obsidian, notion]
obsidian:
  enabled: true
  vault_path: /tmp/vault
notion:
  enabled: true
  token_env: NOTION_TOKEN
  database_id: old-db
  parent_page_id: new-parent
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  primary_search_adapter: obsidian
  write_strategy: primary_only
`);
    const cfg = loadConfig(configPath);
    expect(cfg.notion?.parent_page_id).toBe('new-parent');
  });
});

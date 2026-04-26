import { describe, it, expect } from 'vitest';
import { resolveAdapterTargets } from '../../../src/cli/commands/add.js';
import type { Config } from '../../../src/core/types.js';

function baseCfg(overrides: Partial<Config['defaults']> = {}, withNotion = false): Config {
  return {
    version: 1,
    adapters: withNotion ? ['obsidian', 'notion'] : ['obsidian'],
    obsidian: {
      enabled: true,
      vault_path: '/tmp/vault',
      folders: { atoms: '10-Atoms', sessions: '20-Sessions', moc: '00-MOC' },
    },
    notion: withNotion
      ? { enabled: true, token_env: 'NOTION_TOKEN', database_id: 'db1' }
      : undefined,
    defaults: {
      source: 'claude-code',
      confidence: 'medium',
      primary_adapter: 'obsidian',
      primary_search_adapter: 'obsidian',
      write_strategy: 'primary_only',
      ...overrides,
    },
  };
}

describe('resolveAdapterTargets', () => {
  it('--to=obsidian returns only obsidian', () => {
    expect(resolveAdapterTargets('obsidian', baseCfg({}, true))).toEqual(['obsidian']);
  });

  it('--to=notion returns only notion', () => {
    expect(resolveAdapterTargets('notion', baseCfg({}, true))).toEqual(['notion']);
  });

  it('--to=all returns both', () => {
    expect(resolveAdapterTargets('all', baseCfg({}, true))).toEqual(['obsidian', 'notion']);
  });

  it('--to=obsidian,notion returns both', () => {
    expect(resolveAdapterTargets('obsidian,notion', baseCfg({}, true))).toEqual(['obsidian', 'notion']);
  });

  it('default with primary_only returns primary_adapter', () => {
    expect(resolveAdapterTargets(undefined, baseCfg({ write_strategy: 'primary_only', primary_adapter: 'obsidian' }, true))).toEqual(['obsidian']);
  });

  it('default with primary_only and primary=notion returns notion', () => {
    expect(resolveAdapterTargets(undefined, baseCfg({ write_strategy: 'primary_only', primary_adapter: 'notion' }, true))).toEqual(['notion']);
  });

  it('default with strategy=all returns both', () => {
    expect(resolveAdapterTargets(undefined, baseCfg({ write_strategy: 'all' }, true))).toEqual(['obsidian', 'notion']);
  });

  it('default with strategy=sequential returns both', () => {
    expect(resolveAdapterTargets(undefined, baseCfg({ write_strategy: 'sequential' }, true))).toEqual(['obsidian', 'notion']);
  });

  it('trims whitespace in csv input', () => {
    expect(resolveAdapterTargets('obsidian , notion', baseCfg({}, true))).toEqual(['obsidian', 'notion']);
  });

  it('drops empty entries in csv', () => {
    expect(resolveAdapterTargets(',obsidian,,notion,', baseCfg({}, true))).toEqual(['obsidian', 'notion']);
  });
});

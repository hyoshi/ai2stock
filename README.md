# AI2Stock

> Stock AI conversations as Atomic Notes in your Obsidian Vault.
> Turn ephemeral chats into a searchable second brain.

[日本語版 README](./README.ja.md)

## What is this?

`/stock` your last (or any past) Claude Code response and AI2Stock will:

1. Save it as a Markdown Atomic Note in your Obsidian Vault
2. Auto-classify the type (decision / snippet / learning / reference)
3. Group it under the current Claude Code session folder
4. Auto-link it to related notes by shared tags
5. Update a project Map-of-Content

You can also `--append`, `--replace`, replace a single section, or delete — all by **natural-language commands**.

## Why?

LLM agents have memory, but it's fragmented across sessions and not easy for humans to look back at. AI2Stock converts the **flow** of conversation into **stock** of knowledge — accessible, searchable, and yours.

## Features

- **`/stock` slash command** for Claude Code
- **Natural-language operation**: `/stock 30分前のBYOD議論を保存` etc.
- **Atomic Notes** in Obsidian Vault format (just plain Markdown + YAML frontmatter)
- **Session-based folders**: each Claude Code session has its own folder
- **Auto-classification**: decision / snippet / learning / reference
- **Same-tag backlinks**: new atoms auto-link to related atoms
- **Project MOC**: per-project index file auto-generated
- **Symlink-safe path handling**, **atomic writes**, **TOCTOU race protection**

## Install

Currently distributed via local `npm link` (npm publish is pending). Requires Node.js 20+.

```bash
git clone https://github.com/hyoshi/ai2stock.git
cd ai2stock
npm install
npm run build
npm link
```

## Quick Start

### 1. Initialize

```bash
ai2stock init
```

Interactive prompts:
- Obsidian Vault path (auto-detected if you have one in common locations)
- Default project name (optional)
- Whether to install the `/stock` slash command to `~/.claude/commands/`

### 2. Use it in Claude Code

In any Claude Code session, after the assistant gives a response you want to keep:

```
/stock
```

The previous assistant response is saved to your Vault.

### 3. Look it up later

Open Obsidian → navigate to `<Vault>/10-Atoms/<session-name>/` → find your note.

Or use the CLI:

```bash
ai2stock list --recent=10
ai2stock list --tag=naming
ai2stock list --project=ai2stock
```

## Commands

### Slash command

| Command | Action |
|---|---|
| `/stock` | Save the previous assistant response as a new atom |
| `/stock 追記` | Append to the most recent atom |
| `/stock 置換` | Replace the most recent atom |
| `/stock <atom name>を更新` | Find and replace a specific atom (with confirmation) |
| `/stock 30分前のBYOD議論を保存` | Save a past topic from the conversation history |
| `/stock <atom name>削除` | Delete a specific atom (with confirmation) |
| `/stock --dry-run` | Preview without saving |

### CLI

| Command | Action |
|---|---|
| `ai2stock init` | Set up vault path and slash command |
| `ai2stock add [content]` | Save a new atom |
| `ai2stock add --append --id=<id>` | Append to a specific atom |
| `ai2stock add --replace --id=<id>` | Replace a specific atom |
| `ai2stock list` | List recent atoms |
| `ai2stock delete --id=<id> --force` | Delete an atom |

## Vault Structure

```
<vault>/
├── 10-Atoms/
│   └── <session-name>/        # auto-detected from Claude Code session
│       └── <id>.md
├── 00-MOC/
│   └── projects/
│       └── <project>.md       # auto-generated project index
└── 20-Sessions/                # reserved for future use
```

## Frontmatter

Every atom has structured frontmatter:

```yaml
id: 2026-04-26-1943-example
type: reference
created: 2026-04-26T19:43:00+09:00
ai-generated: true
session_name: AI2Stock
session_dir: /Users/.../my-project
project: ai2stock
tags: [spec, oss]
source: claude-code
confidence: medium
```

## Configuration

`~/.config/ai2stock/config.yml`:

```yaml
version: 1
adapters: [obsidian]
obsidian:
  enabled: true
  vault_path: /path/to/your/vault
  folders:
    atoms: 10-Atoms
    sessions: 20-Sessions
    moc: 00-MOC
defaults:
  source: claude-code
  confidence: medium
  default_project: my-project
```

## Development

```bash
npm test         # vitest, 56 tests
npm run build    # tsc → dist/
npm run dev      # tsx (no build needed)
```

TDD with vitest. All current tests pass; new features land with tests.

## Roadmap

- v0.4: Notion adapter, `/recall` search command
- v0.5: MCP server (works in Claude Desktop, Cursor, Cline, etc.)
- v0.6: AI-merge for partial updates

## License

MIT

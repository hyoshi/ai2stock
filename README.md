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

### Prerequisites

- **Node.js 20+** (`node -v` to check, install from [nodejs.org](https://nodejs.org/))
- **npm** (bundled with Node.js)
- **git** (most systems already have it)
- **An Obsidian Vault** (a folder of `.md` files; Obsidian app itself is optional)
- **Claude Code** if you want the `/stock` slash command

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/hyoshi/ai2stock/main/install.sh | bash
```

What it does:

1. Verifies Node 20+, npm, git are present
2. Runs `npm install -g github:hyoshi/ai2stock`
   (the `prepare` script auto-builds `dist/` from TypeScript)
3. Runs `ai2stock init` interactively:
   - Pick (or create) your Obsidian Vault path
   - Set a default project name (optional)
   - Install `/stock` slash command into `~/.claude/commands/`

After this, `/stock` is ready to use in Claude Code.

### Manual

If you prefer to run the steps yourself:

```bash
npm install -g github:hyoshi/ai2stock
ai2stock init
```

### Local development

```bash
git clone https://github.com/hyoshi/ai2stock.git
cd ai2stock
npm install
npm run build
npm link
ai2stock init
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| `ai2stock: command not found` after install | Check `npm config get prefix` — the `bin/` subdirectory must be on your `PATH` |
| `Node.js 20+ required` | Upgrade Node.js (e.g. via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm)) |
| `EACCES` on `npm install -g` | Use a Node version manager (nvm/fnm) or set a user-writable npm prefix; do **not** use `sudo` |
| `/stock` not found in Claude Code | Re-run `ai2stock init` to (re-)install the slash command |

### Update

```bash
npm install -g github:hyoshi/ai2stock
```

(re-running pulls the latest commit from `main`.)

### Uninstall

```bash
npm uninstall -g @yoshinaga/ai2stock
rm -f ~/.claude/commands/stock.md
rm -rf ~/.config/ai2stock        # config + recent.json (vault is untouched)
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
adapters: [obsidian]              # add 'notion' to also write to Notion
obsidian:
  enabled: true
  vault_path: /path/to/your/vault
  folders:
    atoms: 10-Atoms
    sessions: 20-Sessions
    moc: 00-MOC
notion:                           # optional, only if you want Notion
  enabled: true
  token_env: NOTION_TOKEN
  parent_page_id: 1a2b3c...       # ID of the Notion page that holds your atoms
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  write_strategy: primary_only    # primary_only | all | sequential
  default_project: my-project
```

## Notion Adapter (optional)

AI2Stock writes each atom as a **child page under a parent page** in Notion. This means each atom appears as a separate file-like entry in Notion's left sidebar (when you expand the parent).

Frontmatter (type / tags / project / session / confidence / etc.) is embedded as a callout block at the top of each page.

### Setup

1. Create a Notion Integration at https://www.notion.so/my-integrations and copy the Internal Integration Token (`secret_xxx` or `ntn_xxx`).
2. In Notion, create a **parent page** (e.g. "AI2Stock Atoms") that will hold all your atoms.
3. Open the parent page, click `... → Connections → <your integration>` to grant access.
4. Copy the Parent Page ID (the last 32 characters in its URL, before `?v=` if any).
5. Set the token in your shell:
   ```bash
   # bash (macOS Terminal opens login shell → .bash_profile)
   echo 'export NOTION_TOKEN=ntn_xxx' >> ~/.bash_profile
   source ~/.bash_profile

   # or zsh
   echo 'export NOTION_TOKEN=ntn_xxx' >> ~/.zshrc
   source ~/.zshrc
   ```
6. Either run `ai2stock init` again (and answer yes to Notion), or edit `~/.config/ai2stock/config.yml` to add the `notion:` section above.

### Switching adapters

| You want | What to do |
|---|---|
| Obsidian only (default) | Default config |
| Both at once | `write_strategy: all` in config |
| Obsidian primary, Notion sometimes | Default + `/stock --to=notion` per call |
| This call: Notion only | `/stock --to=notion` |
| This call: Obsidian only | `/stock --to=obsidian` |
| This call: both | `/stock --to=all` |

### Edit operations on Notion (v0.4.1+)

| Operation | Obsidian | Notion |
|---|---|---|
| `--append` (add to end) | ✅ | ✅ |
| `--replace` (full body replace) | ✅ | ✅ |
| `--section` (replace one heading section) | ✅ | ❌ Obsidian only |
| `delete` | ✅ unlink | ✅ archive |

For Notion edits, an explicit `--id <atom-id>` is required (Notion lookup queries the Title property). For Obsidian, the most-recently-added atom is used by default if `--id` is omitted.

> **Note on delete defaults**: Unlike `/stock` (writes to all enabled adapters by default), `delete` defaults to the **primary adapter only** (safer). To delete from both, pass `--to=all` explicitly. Otherwise you may leave a Notion-only orphan.

Examples:
```bash
echo "more" | ai2stock add --from-stdin --append --to=notion --id=2026-04-26-1943-spec
echo "new body" | ai2stock add --from-stdin --replace --to=notion --id=2026-04-26-1943-spec
ai2stock delete --to=notion --id=2026-04-26-1943-spec --force
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

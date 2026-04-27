# AI2Stock

> Save your AI conversations to Obsidian or Notion.
> Turn ephemeral chats into a searchable second brain.

[日本語版 README](./README.ja.md)

## What it does

Type `/stock` after any Claude Code response and AI2Stock will:

1. Save it as an Atomic Note in your chosen backend — **Obsidian** (Markdown file), **Notion** (page), or both
2. Auto-classify it: decision / snippet / learning / reference
3. File it under the current Claude Code session (folder in Obsidian, sub-page in Notion)
4. Auto-link to related notes by shared tags *(Obsidian)*
5. Update a project Map-of-Content *(Obsidian)*

Append, replace, edit a single section, or delete — all by **natural-language commands**.

## Why

LLM conversations flow past and disappear. AI2Stock turns that **flow** into **stock** — a searchable knowledge base you own. Local Markdown (Obsidian), team-shared workspace (Notion), or both in parallel.

## Features

- **`/stock` slash command** for Claude Code
- **Natural language**: `/stock 30分前のBYOD議論を保存` etc.
- **Two backends**: Obsidian (Markdown + YAML frontmatter) and Notion (pages tree, sidebar-visible)
- **Per-call backend override**: `/stock --to=obsidian|notion|all`
- **Per-session folders / sub-pages** auto-created
- **Auto-classification**: decision / snippet / learning / reference
- **Same-tag backlinks** + **Project MOC** *(Obsidian)*
- **Symlink-safe paths**, **atomic writes**, **TOCTOU race protection** *(Obsidian)*

## Install

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **git**
- **At least one backend**:
  - **Obsidian Vault** — any folder of `.md` files (the Obsidian app itself is optional), OR
  - **Notion** workspace + Internal Integration token
- **Claude Code** — to use the `/stock` slash command

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/hyoshi/ai2stock/main/install.sh | bash
```

The script will:

1. Check Node.js 20+, npm, git
2. `npm install -g github:hyoshi/ai2stock` (TypeScript builds via `prepare`)
3. Run `ai2stock init` to set:
   - Obsidian Vault path
   - Default project name (optional)
   - Notion enable + Parent Page ID (optional — see [Notion Adapter](#notion-adapter-optional))
   - `/stock` slash command into `~/.claude/commands/`

`/stock` is then ready in Claude Code.

### Manual

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
| `ai2stock: command not found` | `npm config get prefix`'s `bin/` must be on your `PATH` |
| `Node.js 20+ required` | Upgrade Node.js — e.g. [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) |
| `EACCES` on `npm install -g` | Use a Node version manager or set a user-writable npm prefix. **Do not use `sudo`** |
| `/stock` not found in Claude Code | Re-run `ai2stock init` |

### Update

```bash
npm install -g github:hyoshi/ai2stock
```

Re-running pulls the latest commit from `main`.

### Uninstall

```bash
npm uninstall -g @yoshinaga/ai2stock
rm -f ~/.claude/commands/stock.md
rm -rf ~/.config/ai2stock        # config + recent.json (your Vault is not deleted)
```

## Quick Start

### 1. Initialize

```bash
ai2stock init
```

Interactive prompts:
- Obsidian Vault path — auto-detected if in a common location
- Default project name *(optional)*
- Enable Notion? — token env + Parent Page ID (see [Notion Adapter](#notion-adapter-optional))
- Install the `/stock` slash command to `~/.claude/commands/`?

### 2. Use it in Claude Code

In any Claude Code session, after the assistant gives a response you want to keep:

```
/stock
```

The previous assistant response is saved to your configured backend(s) (Obsidian by default, Notion too if enabled). Override per call with `/stock --to=notion` or `/stock --to=all`.

### 3. Look it up later

- **Obsidian**: open the Vault → `<Vault>/10-Atoms/<session-name>/` → find your note
- **Notion**: open the parent page → `<session-name>` sub-page → atom page (visible in the sidebar)

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
  # parent_page_id: 1a2b3c...     # OPTIONAL. If absent, session pages are
                                  # created/found at workspace top level.
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  write_strategy: primary_only    # primary_only | all | sequential
  default_project: my-project
```

## Notion Adapter (optional)

AI2Stock organizes atoms in Notion as a 2-level tree:

```
<session-name page>            ← under parent_page_id (parent mode), or workspace top-level (workspace mode)
  └── <atom-id page>           ← each atom; sidebar visibility
```

Frontmatter (type / tags / project / session / confidence / etc.) is embedded as a callout block at the top of each atom page.

There are two layouts:

- **Parent mode** (recommended — Obsidian-equivalent): set `parent_page_id` in config to a single Notion page you create once (e.g. "AI2Stock"). AI2Stock auto-creates a session sub-page per Claude Code session under that parent — no per-session manual work, mirroring Obsidian's `10-Atoms/<session>/` folders.
- **Workspace-top-level mode** (fallback for restricted workspaces): no `parent_page_id`. Session pages live at the workspace top level. You must **manually create one Notion top-level page per session name** you intend to use and connect the integration to each. Use this only when you can't add a single shared parent page.

> **Migration note**: if you upgrade from v0.5.0–v0.5.2 (atoms under `parent_page_id` in either flat or session-tree layout) and switch to workspace mode (drop `parent_page_id`), pre-existing atoms become unreachable via `--id`/`delete`. Either keep `parent_page_id` set, or migrate atoms manually before switching modes.

> **Workspace-mode security note**: AI2Stock will operate on any workspace-top-level page that matches a session name and that the integration can access. Avoid sharing the AI2Stock integration with unrelated top-level pages.

### Setup

1. Create a Notion Integration at https://www.notion.so/my-integrations and copy the Internal Integration Token (`secret_xxx` or `ntn_xxx`).
2. In Notion, create either:
   - **Parent mode (recommended)**: any page that will hold session sub-pages (e.g. "AI2Stock"). Created once; sub-pages are auto-generated per session. OR
   - **Workspace mode (fallback)**: a top-level page titled exactly your session name (e.g. "AI2Stock"). Repeat for each session name you'll use.
3. Open the page, click `... → Connections → <your integration>` to grant access.
4. (Parent mode) Copy the Parent Page ID (the last 32 characters in its URL, before `?v=` if any).
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

## License

MIT

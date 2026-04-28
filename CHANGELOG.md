# Changelog

## 0.6.0

### Added
- **Notion `--section`**: replace a single heading section in a Notion atom page. Works for `heading_1`/`heading_2`/`heading_3` blocks; section bounds detected by next same-or-higher-level heading. Inserts new content after the heading via Notion's `blocks.children.append({ after })`, preserving page order. Shape parity with Obsidian's `--section`.
- New exports in `src/adapters/notion/edit.ts`: `listNotionAtomSections(cfg, pageId)`, `replaceNotionAtomSection(cfg, pageId, sectionTitle, content)`.

### Changed
- `src/adapters/notion/edit.ts` internal refactor: extracted `fetchAllChildren`, `headingLevel`, `headingText`, `deleteBlocksOrAbort` helpers; `replaceNotionAtomBody` now reuses them. Existing public behavior preserved.
- CLI `--section` flow: when both Obsidian and Notion are targeted, prompts once and applies the same section title to both. When only Notion is targeted, fetches sections from the Notion page directly. The "not yet supported for Notion" warning is removed.
- README en/ja edit-operations table: Notion `--section` cell flipped from ❌ to ✅.

### Hardening (from code review)
- `--to=all` pre-flight: when section is replaced on both Obsidian and Notion, the prompt only offers headings present in BOTH. Obsidian-only headings are warned and skipped to prevent partial writes.
- Empty/whitespace heading text is filtered from the section list; an empty `sectionTitle` is rejected before any API call.
- Duplicate heading titles emit a warning (parity with Obsidian: first occurrence is targeted).

### Known limitations
- Headings nested inside `toggle`/`callout`/`column` blocks are not surfaced (only direct page children are scanned).
- Deletes are not transactional in the Notion API; a delete failure aborts the section replace but cannot roll back already-deleted blocks.

## 0.5.3

### Changed
- **Notion adapter**: parent mode is now the recommended path. The `ai2stock init` flow and README guide users toward setting `parent_page_id` so AI2Stock auto-creates a session sub-page per Claude Code session — matching Obsidian's `10-Atoms/<session>/` behavior with zero per-session manual work.
- **Init prompt copy**: setup banner reorders steps to lead with parent-mode page creation; the `parent_page_id` prompt label is shortened and reframed as recommended (empty = workspace mode).
- **Init now warns on workspace-mode selection**: when the user leaves `parent_page_id` empty, `ai2stock init` prints a yellow warning explaining that per-session manual page creation is required. (New stdout output during `init` only — atom write/edit/delete behavior is unchanged.)
- **README (en/ja)**: swapped recommendation labels — parent mode = personal recommended (Obsidian-equivalent); workspace mode = fallback for restricted workspaces. Structure diagram caption reordered to lead with parent mode. Migration note updated to cover v0.5.0–v0.5.2 layouts. Japanese README gains the workspace-mode security note that was previously English-only.

### Notes
- Runtime behavior of atom write / edit / delete is unchanged from 0.5.2 in both modes. The only new code path is the post-prompt warning emitted by `init` when workspace mode is chosen.
- The `parent_page_id` prompt has no programmatic default (Enter still selects workspace mode). Only the prompt label and surrounding guidance changed.
- `package.json` version bumped from `0.1.0` (stale) to `0.5.3` to align with the conceptual versioning used in commit messages.

## 0.5.2

- `parent_page_id` made optional. When omitted, AI2Stock searches/uses workspace-top-level pages titled by session name (workspace mode).

## 0.5.1

- Notion: mirror Obsidian session sub-page tree (`<parent>/<session>/<atom>`).

## 0.5.0 (BREAKING)

- Notion adapter switched from database (rows) to pages-tree (sub-pages) for sidebar visibility. Pre-existing v0.4 atoms in the old database are not migrated.

## 0.4.1

- Notion: append / replace / delete edit operations.

## 0.4.0

- Notion adapter MVP.

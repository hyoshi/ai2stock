# Contributing to AI2Stock

Thanks for your interest in improving AI2Stock. This is a small personal project, so the workflow is intentionally light.

## Quick start

```bash
git clone https://github.com/hyoshi/ai2stock.git
cd ai2stock
npm install
npm test          # 128 tests, all should pass
npm run build     # tsc -> dist/
npm run dev       # tsx (no build needed)
```

## Workflow

1. **Open an issue first** for non-trivial changes (new feature, behavior change, breaking change). For typo fixes / docs / small bugs, a PR alone is fine.
2. **Branch from `main`**: `git checkout -b feat/<short-name>` or `fix/<short-name>`.
3. **TDD by default** — write a failing test, then make it pass. Existing tests use [vitest](https://vitest.dev/).
4. **Keep PRs focused**. One concern per PR; split unrelated changes.
5. **Run `npm test` and `npm run build` locally** before pushing. CI runs both on Node 20.x and 22.x.
6. **Update CHANGELOG.md** under the next unreleased version section if the change is user-visible.
7. **Update README.md and README.ja.md** in lockstep when documentation changes.

## Commit messages

Conventional-style preferred but not enforced:

```
feat(notion): support --section heading replacement
fix(obsidian): handle vault paths with spaces
docs: clarify Notion parent_page_id setup
test: add coverage for empty heading edge case
chore(ci): bump actions/checkout to v5
```

## Code style

- TypeScript with strict types — no `any` in new code if avoidable.
- Many small files preferred over few large ones (existing modules are < 250 lines).
- Source code formats timestamps with the user's local TZ (`Date.getHours()` etc.). Tests pin TZ to `Asia/Tokyo` via `tests/setup.ts` for determinism.

## Backend parity

When adding edit operations:
- Implement in **both** `src/adapters/obsidian/` and `src/adapters/notion/` if feasible.
- Notion deletes are not transactional — abort cleanly on partial failure (see `deleteBlocksOrAbort` for the pattern).
- Update the README en/ja edit-operations table.

## Reporting bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Redact paths and tokens before pasting logs.

## Security issues

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the disclosure process.

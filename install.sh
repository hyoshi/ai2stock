#!/usr/bin/env bash
#
# AI2Stock installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hyoshi/ai2stock/main/install.sh | bash
#
# Requires:
#   - Node.js 20+
#   - npm
#   - git (for npm install from github:)

set -euo pipefail

REPO_SPEC="${AI2STOCK_REPO:-github:hyoshi/ai2stock}"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; exit 1; }

bold "AI2Stock installer"
echo

# 1. Node.js check
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js が見つかりません。https://nodejs.org/ からインストールしてください（v20+）。"
fi
NODE_MAJOR="$(node -v | sed 's/^v\([0-9]*\)\..*/\1/')"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  fail "Node.js 20+ が必要です。現在: $(node -v)"
fi
ok "Node.js $(node -v)"

# 2. npm check
if ! command -v npm >/dev/null 2>&1; then
  fail "npm が見つかりません。Node.js を再インストールしてください。"
fi
ok "npm $(npm -v)"

# 3. git check (npm install from github: requires git)
if ! command -v git >/dev/null 2>&1; then
  fail "git が見つかりません。先にインストールしてください。"
fi
ok "git $(git --version | awk '{print $3}')"

# 4. Install via npm (triggers prepare → tsc build automatically)
echo
bold "Installing ai2stock from ${REPO_SPEC}..."
npm install -g "${REPO_SPEC}"
ok "ai2stock installed: $(command -v ai2stock)"

# 5. Verify CLI
if ! command -v ai2stock >/dev/null 2>&1; then
  warn "ai2stock コマンドが PATH に見つかりません。"
  warn "以下を確認してください:"
  warn "  - npm の global bin が PATH に含まれているか"
  warn "    (確認: npm config get prefix → bin/ サブディレクトリ)"
  exit 1
fi
ok "Version: $(ai2stock --version)"

# 6. Run init
echo
bold "Running 'ai2stock init'..."
ai2stock init

echo
ok "完了！Claude Code で /stock を試してください。"
echo "  プレビューだけ見たい場合: /stock --dry-run"

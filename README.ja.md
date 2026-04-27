# AI2Stock

> AIとの会話を Obsidian Vault に Atomic Notes としてストック。
> 流れていくチャットを、検索可能な「第二の脳」に変える。

[English README](./README.md)

## これは何？

Claude Code セッションで `/stock` を打つと、AI2Stock が以下を実行:

1. 直前の AI 回答を Markdown ファイルとして Obsidian Vault に保存
2. type を自動分類（decision / snippet / learning / reference）
3. **そのセッション専用フォルダ**に振り分け
4. 同タグの過去 Atom と自動的に相互リンク
5. プロジェクト別の目次（MOC）を更新

`--append`（追記）, `--replace`（置換）, section単位の更新, 削除も可能。**自然言語**で指示できる。

## なぜ作ったか

LLM エージェントには記憶機能があるが、セッションごとに分断されており、人間が後から見返すのは困難。AI2Stock は会話の **フロー（流れ去るもの）** を **ストック（蓄積されるもの）** に変換する。

## 機能

- **`/stock` slash command**（Claude Code 用）
- **自然言語操作**: `/stock 30分前のBYOD議論を保存` 等
- **Atomic Notes**（Obsidian Vault 互換、ただの Markdown + YAML frontmatter）
- **セッション別フォルダ**: 各 Claude Code セッションごとに専用フォルダ
- **自動type分類**: decision / snippet / learning / reference
- **同タグ自動リンク**: 関連 Atom に自動 backlink 挿入
- **プロジェクト別 MOC**: プロジェクト別の目次ファイル自動生成
- **シンボリックリンク安全**, **アトミック書き込み**, **TOCTOU race 対策**

## インストール

### 前提条件

- **Node.js 20+** （`node -v` で確認、未導入なら [nodejs.org](https://nodejs.org/) から）
- **npm** （Node.js に同梱）
- **git** （多くの環境に既存）
- **Obsidian Vault**（`.md` を入れるフォルダ。Obsidian アプリ本体は任意）
- **Claude Code**（`/stock` slash command を使う場合）

### ワンライナー（推奨）

```bash
curl -fsSL https://raw.githubusercontent.com/hyoshi/ai2stock/main/install.sh | bash
```

実行内容:

1. Node 20+ / npm / git の存在チェック
2. `npm install -g github:hyoshi/ai2stock` を実行
   （`prepare` script で TypeScript を自動ビルド → `dist/` 生成）
3. `ai2stock init` を対話的に実行:
   - Obsidian Vault のパスを選択（or 新規作成）
   - デフォルトプロジェクト名を設定（任意）
   - `/stock` slash command を `~/.claude/commands/` にインストール

完了後、Claude Code で `/stock` が即利用可能。

### 手動

ステップを自分で実行したい場合:

```bash
npm install -g github:hyoshi/ai2stock
ai2stock init
```

### ローカル開発

```bash
git clone https://github.com/hyoshi/ai2stock.git
cd ai2stock
npm install
npm run build
npm link
ai2stock init
```

### トラブルシューティング

| 症状 | 対処 |
|---|---|
| インストール後 `ai2stock: command not found` | `npm config get prefix` の `bin/` サブディレクトリが `PATH` に含まれているか確認 |
| `Node.js 20+ required` | Node.js をアップグレード（[nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm) 推奨） |
| `npm install -g` で `EACCES` | バージョンマネージャ（nvm/fnm）使用 or ユーザー書き込み可能な npm prefix 設定。`sudo` は使わない |
| Claude Code で `/stock` が出ない | `ai2stock init` を再実行（slash command を再配置） |

### アップデート

```bash
npm install -g github:hyoshi/ai2stock
```

（再実行で `main` 最新を取得）

### アンインストール

```bash
npm uninstall -g @yoshinaga/ai2stock
rm -f ~/.claude/commands/stock.md
rm -rf ~/.config/ai2stock        # 設定 + recent.json （Vault本体は残る）
```

## クイックスタート

### 1. 初期設定

```bash
ai2stock init
```

対話プロンプト:
- Obsidian Vault のパス（よくある場所は自動検出）
- デフォルトプロジェクト名（任意）
- `/stock` slash command を `~/.claude/commands/` に配置するか

### 2. Claude Code で使う

任意の Claude Code セッションで、保存したい AI 回答が表示されたら:

```
/stock
```

直前の AI 回答が Vault に保存される。

### 3. あとで見返す

Obsidian で `<Vault>/10-Atoms/<セッション名>/` に移動して該当ノートを開く。

または CLI で:

```bash
ai2stock list --recent=10
ai2stock list --tag=naming
ai2stock list --project=ai2stock
```

## コマンド

### Slash command

| コマンド | 動作 |
|---|---|
| `/stock` | 直前の AI 回答を新規 Atom として保存 |
| `/stock 追記` | 直近の Atom に追記 |
| `/stock 置換` | 直近の Atom を全置換 |
| `/stock <atom名>を更新` | 特定 Atom を検索→確認→置換 |
| `/stock 30分前のBYOD議論を保存` | 会話履歴中の特定箇所を保存 |
| `/stock <atom名>削除` | 特定 Atom を削除（要確認） |
| `/stock --dry-run` | 保存せずプレビュー |

### CLI

| コマンド | 動作 |
|---|---|
| `ai2stock init` | Vault パス設定 + slash command 配置 |
| `ai2stock add [content]` | Atom 新規作成 |
| `ai2stock add --append --id=<id>` | 特定 Atom に追記 |
| `ai2stock add --replace --id=<id>` | 特定 Atom を置換 |
| `ai2stock list` | 直近 Atom 一覧 |
| `ai2stock delete --id=<id> --force` | Atom 削除 |

## Vault 構造

```
<vault>/
├── 10-Atoms/
│   └── <セッション名>/         # Claude Code セッションから自動検出
│       └── <id>.md
├── 00-MOC/
│   └── projects/
│       └── <project>.md       # プロジェクト別目次（自動生成）
└── 20-Sessions/                # 将来用、現在は未使用
```

## Frontmatter

各 Atom に構造化された frontmatter が付く:

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

## 設定ファイル

`~/.config/ai2stock/config.yml`:

```yaml
version: 1
adapters: [obsidian]              # 'notion' を追加すると Notion 併用
obsidian:
  enabled: true
  vault_path: /path/to/your/vault
  folders:
    atoms: 10-Atoms
    sessions: 20-Sessions
    moc: 00-MOC
notion:                           # Notion を使う時のみ
  enabled: true
  token_env: NOTION_TOKEN
  # parent_page_id: 1a2b3c...     # 任意。省略時は workspace 直下に
                                  # session 名ページを作成/検索
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  write_strategy: primary_only    # primary_only | all | sequential
  default_project: my-project
```

## Notion アダプタ（任意）

Notion 内の構造は以下の2階層:

```
<セッション名 ページ>          ← parent_page_id 配下（parent モード）または workspace 直下（workspace モード）
  └── <atom-id ページ>          ← atom 本体（sidebar に表示）
```

frontmatter（type / tags / project / session / confidence など）は atom ページ先頭の callout block に埋め込まれます。

2つのモードがあります:

- **parent モード**（推奨・Obsidian と同等）: `parent_page_id` を 1 つの親ページ（例: 「AI2Stock」）に設定。Claude Code のセッションごとにそのサブページを AI2Stock が**自動作成** — Obsidian の `10-Atoms/<セッション名>/` と同じ運用。手動作業は親ページの初回作成 1 回のみ。
- **workspace 直下モード**（制約のある workspace 用 fallback）: `parent_page_id` 省略。セッション名と同タイトルの top-level ページを**毎セッション分手動作成**して Integration に共有する必要がある。共有された親ページを置けないとき以外は parent モードを推奨。

> **マイグレーション注意**: v0.5.0–v0.5.2（`parent_page_id` 配下に atom がフラット or セッションツリーで配置）から workspace モード（`parent_page_id` を外す）に切り替えると、既存 atom は `--id`/`delete` で到達できなくなります。`parent_page_id` を維持するか、モード切替前に手動移行してください。

> **workspace モードのセキュリティ注意**: workspace モードでは AI2Stock はセッション名と一致しかつ Integration がアクセスできる任意の top-level ページを操作対象にします。AI2Stock Integration を関係ない top-level ページに共有しないでください。

### セットアップ

1. https://www.notion.so/my-integrations で Integration を作成し、Token (`secret_xxx` または `ntn_xxx`) をコピー
2. Notion で:
   - **parent モード（推奨）**: 任意の親ページを作成（例: 「AI2Stock」）。1 度だけ作れば以降のセッションごとのサブページは自動生成される、または
   - **workspace モード（fallback）**: セッション名と同じタイトルの top-level ページを作成（例: 「AI2Stock」）。使うセッション名ごとに繰り返し必要
3. ページの `... → Connections → 作成した Integration` を選んで接続
4. （parent モード）親ページ URL 末尾の 32 文字（`?v=` の前）が Parent Page ID
5. シェルに token を設定:
   ```bash
   # bash (macOS Terminal は login shell → .bash_profile)
   echo 'export NOTION_TOKEN=ntn_xxx' >> ~/.bash_profile
   source ~/.bash_profile

   # または zsh
   echo 'export NOTION_TOKEN=ntn_xxx' >> ~/.zshrc
   source ~/.zshrc
   ```
6. `ai2stock init` を再実行（Notionを「はい」で）か、`~/.config/ai2stock/config.yml` に上の `notion:` セクションを追記

### アダプタの切替

| やりたいこと | 方法 |
|---|---|
| Obsidian のみ（デフォルト） | デフォルト設定 |
| 両方同時に書き込み | configで `write_strategy: all` |
| Obsidian主、Notionは時々 | デフォルト + `/stock --to=notion`（その都度） |
| このコマンドだけ Notion | `/stock --to=notion` |
| このコマンドだけ Obsidian | `/stock --to=obsidian` |
| このコマンドで両方 | `/stock --to=all` |

### Notion での編集操作（v0.4.1+）

| 操作 | Obsidian | Notion |
|---|---|---|
| `--append`（末尾追記） | ✅ | ✅ |
| `--replace`（本文全置換） | ✅ | ✅ |
| `--section`（1見出し section 置換） | ✅ | ❌ Obsidian のみ |
| `delete` | ✅ unlink | ✅ archive |

Notion 編集には明示的に `--id <atom-id>` が必要（Notion 側は Title property で検索）。Obsidian は `--id` 省略時 recent.json の直近 atom を対象にします。

> **delete のデフォルト挙動について**: `/stock` は全アダプタに書きますが、`delete` は**安全側に倒して primary adapter のみ**がデフォルトです。両方から消す場合は `--to=all` を明示してください。さもないと Notion 側に孤児が残ることがあります。

例:
```bash
echo "追記する内容" | ai2stock add --from-stdin --append --to=notion --id=2026-04-26-1943-spec
echo "新しい本文" | ai2stock add --from-stdin --replace --to=notion --id=2026-04-26-1943-spec
ai2stock delete --to=notion --id=2026-04-26-1943-spec --force
```

## 開発

```bash
npm test         # vitest, 56テスト
npm run build    # tsc → dist/
npm run dev      # tsx（ビルド不要）
```

TDD（vitest）。全テスト GREEN 維持、新機能はテストとセットで追加。

## ロードマップ

- v0.4: Notion アダプタ、`/recall` 検索コマンド
- v0.5: MCP サーバー化（Claude Desktop / Cursor / Cline 等で動作）
- v0.6: 部分更新の AI-merge

## ライセンス

MIT

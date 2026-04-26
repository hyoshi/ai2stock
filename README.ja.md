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
  database_id: 1a2b3c...
defaults:
  source: claude-code
  confidence: medium
  primary_adapter: obsidian
  write_strategy: primary_only    # primary_only | all | sequential
  default_project: my-project
```

## Notion アダプタ（任意）

Obsidian に加えて（または代わりに）Notion Database へも保存できます。

### セットアップ

1. https://www.notion.so/my-integrations で Integration を作成し、Token (`secret_xxx`) をコピー
2. Notion で新規 Database を作成し、以下の Property を持たせる（追加のpropertyは自由）:

   | Property | 型 |
   |---|---|
   | Title | Title |
   | Type | Select |
   | Tags | Multi-select |
   | Project | Select |
   | Session | Text |
   | Created | Date |
   | AI-Generated | Checkbox |
   | Confidence | Select |

3. Database の `... → Connections → 作成した Integration` を選んで接続
4. Database URL 末尾の 32 文字が Database ID
5. シェルに token を設定:
   ```bash
   echo 'export NOTION_TOKEN=secret_xxx' >> ~/.zshrc
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

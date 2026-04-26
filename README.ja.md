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

現在は `npm link` によるローカル配布（npm publish 未公開）。Node.js 20+ 必須。

```bash
git clone https://github.com/hyoshi/ai2stock.git
cd ai2stock
npm install
npm run build
npm link
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

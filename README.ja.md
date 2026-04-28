# AI2Stock

**AIとの会話を Obsidian や Notion に保存。**
**流れ去るチャットを、検索できる「第二の脳」に。**

[English README](./README.md)

## できること

Claude Code の回答のあとに `/stock` と打つだけで、AI2Stock が:

1. **Obsidian**（Markdown ファイル）か **Notion**（ページ）、または両方に Atomic Note として保存
2. type を自動分類: decision / snippet / learning / reference
3. 現在の Claude Code セッション単位で振り分け（Obsidian はフォルダ、Notion はサブページ）
4. 同タグの過去 Atom と自動相互リンク *(Obsidian)*
5. プロジェクト別の目次（MOC）を更新 *(Obsidian)*

追記・置換・section 単位の更新・削除も、すべて**自然言語**で指示可能。

## なぜ

LLM との会話は流れ去って後で見返せない。AI2Stock はその**フロー**を**ストック**に変える — 自分の手元に、検索できる形で。ローカル Markdown（Obsidian）、チーム共有（Notion）、両方並行 — 用途に合わせて選べる。

## 機能

- **`/stock` slash command**（Claude Code）
- **自然言語**: `/stock 先ほどの仕様書を今の内容で更新` 等
- **2 つのバックエンド**: Obsidian（Markdown + YAML frontmatter）と Notion（ページツリー、sidebar 表示）
- **コール単位の切替**: `/stock --to=obsidian|notion|all`
- **セッション単位のフォルダ／サブページ**を自動生成
- **自動 type 分類**: decision / snippet / learning / reference
- **同タグ自動リンク** + **プロジェクト別 MOC** *(Obsidian)*
- **symlink 安全 / アトミック書込 / TOCTOU race 対策** *(Obsidian)*

## インストール

### 前提条件

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **git**
- **保存先のいずれか**:
  - **Obsidian Vault** — `.md` を置くフォルダ（Obsidian アプリ本体は不要）、または
  - **Notion** workspace + Internal Integration Token
- **Claude Code** — `/stock` slash command を使う場合

### ワンライナー（推奨）

```bash
curl -fsSL https://raw.githubusercontent.com/hyoshi/ai2stock/main/install.sh | bash
```

スクリプトの内容:

1. Node.js 20+ / npm / git の存在チェック
2. `npm install -g github:hyoshi/ai2stock`（TypeScript は `prepare` で自動ビルド）
3. `ai2stock init` を対話的に実行し、以下を設定:
   - Obsidian Vault のパス
   - デフォルトプロジェクト名 *(任意)*
   - Notion を使うか + Parent Page ID（[Notion アダプタ](#notion-アダプタ任意) 参照）
   - `/stock` slash command を `~/.claude/commands/` に配置

これで Claude Code から `/stock` が使えるようになります。

### 手動

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
| `ai2stock: command not found` | `npm config get prefix` の `bin/` が `PATH` にあるか確認 |
| `Node.js 20+ required` | Node.js をアップグレード（[nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm) 推奨） |
| `npm install -g` で `EACCES` | nvm/fnm 等のバージョンマネージャを使うか、user-writable な npm prefix を設定。`sudo` は不可 |
| Claude Code で `/stock` が出ない | `ai2stock init` を再実行 |

### アップデート

```bash
npm install -g github:hyoshi/ai2stock
```

`main` の最新コミットを取得します。

### アンインストール

```bash
npm uninstall -g @yoshinaga/ai2stock
rm -f ~/.claude/commands/stock.md
rm -rf ~/.config/ai2stock        # 設定 + recent.json（Vault 本体は削除されません）
```

## クイックスタート

### 1. 初期設定

```bash
ai2stock init
```

対話プロンプト:
- Obsidian Vault のパス — よくある場所は自動検出
- デフォルトプロジェクト名 *(任意)*
- Notion を使うか — Token 環境変数 + Parent Page ID（[Notion アダプタ](#notion-アダプタ任意) 参照）
- `/stock` slash command を `~/.claude/commands/` に配置するか

### 2. Claude Code で使う

任意の Claude Code セッションで、保存したい AI 回答が表示されたら:

```
/stock
```

直前の AI 回答が、設定したバックエンド（デフォルトは Obsidian、Notion 有効時は Notion にも）に保存される。コール単位の切替は `/stock --to=notion` / `/stock --to=all` 等で。

### 3. あとで見返す

- **Obsidian**: Vault を開く → `<Vault>/10-Atoms/<セッション名>/` → 該当ノート
- **Notion**: 親ページを開く → `<セッション名>` サブページ → atom ページ（sidebar 表示）

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
| `/stock 先ほどの仕様書を今の内容で更新` | 既存 atom を直前の会話内容で更新 |
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
| `--section`（1見出し section 置換） | ✅ | ✅ |
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

## ライセンス

MIT

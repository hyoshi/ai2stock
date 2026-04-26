---
description: Stock the previous assistant response as an Atom in your Obsidian Vault (AI2Stock)
allowed-tools: Bash
---

直前のassistant回答（あなた自身の直近の回答）を AI2Stock のAtomとしてVaultに保存せよ。

## 引数の解析

ユーザーが渡した引数 `$ARGUMENTS` から以下のフラグを抽出:

### 動作モード（排他、いずれか1つ）
- `--append` を含む → **直近Atomに追記**（IDなし、CLIが自動）
- `--replace` を含む → **直近Atomを置換**（IDなし、CLIが自動）
- `--section` を含む → **直近Atomの1セクションだけ置換**（CLIが対話的にsection選択）
- `--pick` を含む → **対話式ピッカー**で対象Atom選択（--appendなどと組み合わせ可能）
- フラグなし → **新規Atom作成**

### 内容オプション
- `--dry-run` を含む → 保存せずプレビュー
- `--type=<type>` → type強制指定（decision/snippet/learning/reference）
- `--tags=<tag1,tag2>` → タグ追加
- `--project=<name>` → プロジェクト名
- `--confidence=<level>` → high/medium/low
- `--title=<title>` → タイトル明示

## 実行手順

1. 直前のassistant回答（このメッセージの**前のあなたの応答**）の本文を抽出する
2. 引数からオプションを組み立てる
3. CLIを呼び出す:

   **短い回答（引数渡し）:**
   ```bash
   ai2stock add "<直前の回答全文>" [オプション]
   ```

   **長い回答（stdin経由）:**
   ```bash
   cat <<'EOF' | ai2stock add --from-stdin [オプション]
   <直前の回答全文>
   EOF
   ```

4. CLIの出力をユーザーに簡潔に報告

## 例

| ユーザー入力 | 動作 |
|---|---|
| `/stock` | 新規Atom作成 |
| `/stock --dry-run` | プレビューのみ |
| `/stock --append` | 直近Atomに追記 |
| `/stock --replace` | 直近Atomを置換 |
| `/stock --section` | 直近Atomの1section選んで置換 |
| `/stock --pick --append` | ピッカーで選んでから追記 |
| `/stock --type=decision --tags=oss,naming` | type/tags強制指定で新規 |

## 注意

- 直前のassistant回答に複数トピックが含まれる場合、最も価値の高い部分を優先
- コードブロック・URL・意思決定文言を保ったまま渡す
- ユーザーへの返答は簡潔に（保存先と関連Atomのみ）
- `--section` と `--pick` は対話式プロンプト（terminal stdin）が動くため、Bashで `</dev/tty` リダイレクトが必要な場合あり

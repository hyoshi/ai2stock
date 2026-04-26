---
description: Stock the previous assistant response as an Atom in your Obsidian Vault (AI2Stock). Supports natural language and explicit flags.
allowed-tools: Bash
---

# /stock — AI2Stock

直前のassistant回答を AI2Stock のAtomとして Vault に保存・編集・削除せよ。
**自然言語の指示と明示フラグの両方を受け入れる**。

## 引数解釈の優先順位

1. **明示フラグ**（`--append`, `--replace`, `--section`, `--pick`, `--id=<id>`, `--dry-run`, `--type=<t>`, `--tags=<x,y>`, `--project=<p>`, `--confidence=<l>`, `--title=<t>`, `--delete`） → そのまま CLI に渡す
2. **自然言語**（フラグ無しの場合）→ 文意を解釈して適切な操作にマッピング

## 自然言語の解釈ルール

引数 `$ARGUMENTS` を読み取り、以下のパターンで意図を判定:

| 自然文パターン | 解釈 | 実行 |
|---|---|---|
| 空、`stock`, `保存`, `記録` | 新規作成 | `ai2stock add ...` |
| `追記`, `add to`, `append` | 直近に追記 | `ai2stock add --append` |
| `置換`, `書き直し`, `replace`, `上書き` | 直近を置換 | `ai2stock add --replace` |
| `セクション`, `section更新`, `<見出し>を更新` | 直近のsection置換 | `ai2stock add --section` |
| `<atom名>を更新/置換/書き直し` | 該当atomを置換 | list検索→ID特定→確認→`--replace --id=<id>` |
| `<atom名>に追記` | 該当atomに追記 | list検索→ID特定→`--append --id=<id>` |
| `<atom名>削除`, `delete <atom名>` | 削除 | list検索→ID特定→確認→`ai2stock delete --id=<id> --force` |
| `dry-run`, `プレビュー` | プレビューのみ | `--dry-run` 付ける |

## Atom特定アルゴリズム（自然言語のatom名→ID）

1. `ai2stock list` を実行して候補一覧を取得
2. 自然文中のキーワード（タイトル、タグ、プロジェクト、type）を抽出
3. 候補から最も合致する1件を選ぶ
4. **複数候補ヒットした場合**は番号付きで提示してユーザに選択を促す（実行前停止）
5. **0件**なら「該当Atomなし」と報告して停止

## 破壊的操作の確認プロトコル

以下は**必ず実行前に確認プロンプト**を出す:

- `--replace`（atom全置換）
- `--section`（section置換）
- `delete`（atom削除）

確認フォーマット:

```
対象: <id> (<title>, project: <p>)
操作: <置換|削除|section置換>
新内容（先頭3行プレビュー）:
  > <line1>
  > <line2>
  > <line3>
実行しますか? [y/n]
```

ユーザの「y」「はい」「OK」「実行」等の同意があってから初めて CLI 実行。
「n」「いいえ」「やめる」等は中止。

非破壊的操作（`--append`, 新規作成）は確認不要。

## CLI 呼び出し方法

### 短い回答
```bash
ai2stock add "<直前の回答全文>" [オプション]
```

### 長い回答（推奨: stdin経由）
```bash
cat <<'EOF' | ai2stock add --from-stdin [オプション]
<直前の回答全文>
EOF
```

### 既存atom操作
```bash
# 追記
cat <<'EOF' | ai2stock add --from-stdin --append --id=<id>
<新内容>
EOF

# 全置換
cat <<'EOF' | ai2stock add --from-stdin --replace --id=<id>
<新内容>
EOF

# 削除（プレビュー）
ai2stock delete --id=<id>

# 削除（実行）
ai2stock delete --id=<id> --force
```

## 例: 自然言語フロー

### 例1: 単純な保存
ユーザー: `/stock`
→ 直前の私の回答を新規Atom化

### 例2: 直近に追記
ユーザー: `/stock 追記`
→ `ai2stock add --append`

### 例3: 特定Atomを置換
ユーザー: `/stock AI2Stockの仕様atomを更新`
→ Claude:
  1. `ai2stock list --project=ai2stock` 実行
  2. 候補から「ai2stock-v0-3」等を特定
  3. 確認プロンプト表示
  4. 同意後 `ai2stock add --replace --id=<id> --from-stdin <<<...`

### 例4: 削除
ユーザー: `/stock 古いMVP atomを削除`
→ Claude:
  1. list検索→該当atom特定
  2. 確認プロンプト
  3. 同意後 `ai2stock delete --id=<id> --force`

### 例5: 候補が複数
ユーザー: `/stock AI2Stockのatomを更新`
→ Claude:
  ```
  該当候補が複数あります:
    1. 2026-04-26-1943-ai2stock-v0-3 (spec)
    2. 2026-04-26-1041-untitled (roadmap)
  どれですか? [1/2]
  ```
  ユーザの選択を待ってから実行

## 報告

CLI実行後、以下を簡潔に報告:
- 保存先パス（相対）
- 操作種別（新規/追記/置換/section/削除）
- 関連付けされたAtom（あれば）
- MOC更新（あれば）

長い説明は不要。

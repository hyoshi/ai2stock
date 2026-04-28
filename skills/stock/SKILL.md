---
name: stock
description: Save the previous AI response as an Atomic Note in Obsidian or Notion via AI2Stock. Use when the user types /stock or asks to save / append / replace / delete an AI response. Supports natural language (e.g. "直前の回答を保存", "30分前のBYOD議論を保存", "[atom名]を更新") and explicit flags such as --append, --replace, --section, --id, --dry-run, --type, --tags, --project, --confidence, --title, --delete.
allowed-tools: Bash(ai2stock *) Bash(cat *)
---

# /stock — AI2Stock

直前のassistant回答を AI2Stock のAtomとして Vault に保存・編集・削除せよ。
**自然言語の指示と明示フラグの両方を受け入れる**。

## 引数解釈の優先順位

1. **明示フラグ**（`--append`, `--replace`, `--section`, `--pick`, `--id=<id>`, `--dry-run`, `--type=<t>`, `--tags=<x,y>`, `--project=<p>`, `--confidence=<l>`, `--title=<t>`, `--delete`） → そのまま CLI に渡す
2. **自然言語**（フラグ無しの場合）→ 文意を解釈して適切な操作にマッピング

## 自然言語の解釈ルール

引数 `$ARGUMENTS` を読み取り、以下のパターンで意図を判定:

### 内容の出処（content source）

| 自然文パターン | content source |
|---|---|
| 引数なし or 出処指定なし | **直前のassistant回答** |
| `直前の`, `さっきの回答` | 直前のassistant回答 |
| `さっきの<トピック>`, `<時間>前の<トピック>`, `セッション最初の<トピック>`, `<トピック>議論` | **会話履歴中の特定箇所**（後述） |

### 操作モード

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

## 会話履歴中の特定箇所を抽出するアルゴリズム

ユーザが「直前」以外の発言を参照した場合、Claudeは自分の会話履歴（context内に保持）を遡って該当箇所を抽出する。

### 解決手順

1. 自然文から **時間・トピック・関係** ヒントを抽出
   - **時間**: 「30分前」「さっき」「セッション最初」「前回」「今日の朝」
   - **トピック**: キーワード（例: BYOD、命名、コードレビュー、TDD）
   - **関係**: 「私の質問の答え」「3回前の発言」「あなたが提案した案」

2. 会話履歴を該当箇所に向けて遡る:
   - **トピック優先**: キーワードを含む過去のassistant発言を検索
   - **時間で絞り込み**: 「30分前」等は経過時間を推定して該当範囲に絞る
   - **複数発言が連続している場合**: トピック単位でひとまとまりに抽出

3. **抽出内容のプレビュー**を表示:
   ```
   抽出元: ~30分前のassistant発言（トピック: BYOD仕様）
   内容（先頭3行）:
     > BYODは「Bring Your Own Data」の略で...
     > 主な要素は3つ:
     >   1. ユーザーが自前のデータソースを...
   全文 ○○○○ 文字
   操作: <新規作成|追記|置換> [対象atom: <id>]
   実行しますか? [y/n]
   ```

4. 同意後、抽出内容を `cat <<'EOF' | ai2stock add --from-stdin ...` で渡して実行

### 曖昧時の対応

| 状況 | 動作 |
|---|---|
| 該当0件 | 「会話履歴に該当箇所なし」と報告して停止 |
| 該当複数（候補が散在） | 番号付きで候補提示、ユーザに選択を促す |
| 抽出範囲が長すぎる（>3000字） | 「全文○○○○字。要約して保存しますか? それとも全文? [a=要約 / f=全文 / n=中止]」 |
| 抽出範囲が不明確 | 「どこからどこまでですか? 開始: ___ 終了: ___」 |

### 注意

- **会話履歴はClaudeのcontext内のみ参照可能**。context外（過去セッション）は参照不可 → 「過去セッションは参照できません」と報告
- 抽出後、保存内容に「<extracted from session>」等のメタは付けない（自然な本文として保存）
- frontmatter `session_name`, `session_dir` は通常通り（現在のセッション情報）が記録される

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

### 例6: 過去発言を保存
ユーザー: `/stock 30分前のBYOD議論を保存`
→ Claude:
  1. 会話履歴を遡ってBYOD関連発言を抽出
  2. プレビュー表示（先頭3行 + 全文文字数）
  3. 確認 → `ai2stock add --from-stdin` で保存

### 例7: 過去発言を既存atomに追記
ユーザー: `/stock さっきの命名議論の結論をAI2Stock atomに追記`
→ Claude:
  1. 命名議論の「結論」部分を会話履歴から抽出
  2. AI2Stock atomを list検索→特定
  3. 確認 → `--append --id=<id>` で実行

## 報告

CLI実行後、以下を簡潔に報告:
- 保存先パス（相対）
- 操作種別（新規/追記/置換/section/削除）
- 関連付けされたAtom（あれば）
- MOC更新（あれば）

長い説明は不要。

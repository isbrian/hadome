# T-023 / T-024 引継ぎ（2026-11-20）

## 完了内容

`T-023 Supervisor MVP` のオフライン版を、隔離 worktree `t023-supervisor-mvp` に実装した。基準 HEAD は `df2d86a1`。専用 JSON 保存、冪等性、原子的な排他、owner/runId/lease、heartbeat、期限切れ unknown、注入 fake executor、安全性が明示された失敗だけの最大 3 回再試行を含む。正式実行器、既存 Bridge、実ブラウザー、既存ポートには接続していない。

## 検証証拠

- Supervisor：M1 5/5、M2 6/6、M3 8/8、計 19/19 PASS。
- 既存 Node 回帰：7 テストファイル、27/27 PASS。
- 合計：10 テストファイル、46/46 PASS。
- `npm ci --ignore-scripts` による隔離依存インストール済み。Webview build PASS。VSIX package PASS（`hadome-0.1.22.vsix`、3943 files / 10.91 MB）。`extension/src/supervisor.js` が VSIX に存在することも確認済み。
- 詳細：`report/T-023_T-024_supervisor-verification_2026-11-19.md`。
- 計画：`report/T-023_supervisor-implementation-plan_2026-11-19.md`。

## 保留と注意事項

1. T-019 の実ブラウザー E2E は WARN／受入保留のまま。今回のオフライン PASS によって変更しない。
2. fake executor は注入関数方式であり、任意の外部副作用を強制的に禁止する sandbox ではない。正式実行器を無断で接続しない。
3. `unknown`、残存ロック、期限切れについては自動再実行・自動引継ぎを禁止。人手による処置仕様と UI は未実装。
4. 生成 VSIX には多くの node_modules が含まれる。bundling 最適化は別課題。
5. 元作業領域の `todo/todo.md` の既存変更 1 件と未追跡 15 件は保持した。これらは T-023／T-024 の commit・PR に含めていない。隔離 worktree の 8 ファイルは commit・push・PR・merge 済みであり、以前の「未コミット」記載をここで更新する。

## PR #25 マージ後の Git 確認（2026-11-20）

- 対象リポジトリ：`isbrian/hadome`。PR：`https://github.com/isbrian/hadome/pull/25`（`MERGED`、base `develop`）。`main` は操作していない。
- 実装 commit：`6c78384a7f82b9e6f12554f66dd713af1b6ad456`。変更は新規 8 ファイル、760 行追加のみ。元作業領域の未コミット変更を含まない。
- Merge commit：`e765aa12ef23e01c48a17e6d9ae93501226d7d76`。遠隔 `origin/develop` の HEAD に反映されたことを `ls-remote` で確認済み。
- 元の機能分岐 `t023-supervisor-mvp` はローカルで `end/t023-supervisor-mvp` に改名し、遠隔機能分岐は削除済み。後続の交接文書更新は別の `chore/t023-t024-post-merge-handoff` 分岐で扱い、過去の実装 commit を変更しない。
- GitHub PR は合併前に `CLEAN`／`MERGEABLE`。CI checks は **0 件で、CI PASS ではない**。検証根拠は隔離環境でのオフライン 46/46 PASS、Webview build PASS、VSIX package PASS。
- `T-023` と `T-024` は **オフライン fake executor MVP の実装・検証範囲のみ完了**。正式実行器、製品統合、実ブラウザー E2E は未完了。`T-019` の実ブラウザー E2E は引き続き WARN／受入保留。
- 派工正本 `todo/todo.md` の T-020～T-024 記述は元の作業領域に既存の未コミット変更として存在するため、今回の PR では書き換えない。次回、所有者と編集競合のない状態で正本の反映を確認すること。

## 次回の順序

最初に両 worktree の `git status --short --branch` を確認し、上記の計画と検証報告を読む。その後、仕様判断として unknown の人手復旧、正式実行器の権限・副作用・費用境界、製品 UI への統合方式を検討する。これらが承認されるまでは、現在の fake executor の隔離境界を保持する。正式 Bridge のポート・ブラウザー・ログイン状態を不用意に操作しない。

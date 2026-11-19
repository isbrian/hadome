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
5. 元作業領域の `todo/todo.md` の変更 1 件と未追跡 15 件は保持する。隔離 worktree の変更は未コミット。commit、push、PR、merge はしていない。

## 次回の順序

最初に両 worktree の `git status --short --branch` を確認し、上記の計画と検証報告を読む。その後、仕様判断として unknown の人手復旧、正式実行器の権限・副作用・費用境界、製品 UI への統合方式を検討する。これらが承認されるまでは、現在の fake executor の隔離境界を保持する。正式 Bridge のポート・ブラウザー・ログイン状態を不用意に操作しない。

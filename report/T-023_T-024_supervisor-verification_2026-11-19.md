# T-023 / T-024 Supervisor MVP 検証報告

- 検証日：2026-11-20
- 対象：隔離 worktree `t023-supervisor-mvp`（基準 `df2d86a1`）
- 判定：オフライン fake executor MVP のテスト・ビルド・パッケージ検証は PASS。正式実行器、製品統合、実ブラウザー E2E は対象外。

## 1. 実装

`src/supervisor.js` を追加した。専用ディレクトリの JSON 保存、タスク ID・冪等キー、形式バージョン、workspace 検証、排他的なディレクトリロック、一時ファイルと fsync・atomic rename を実装。claim・start・heartbeat・complete は owner と runId と lease を検証する。期限切れの claimed/running は unknown として保存し、自動再試行しない。残存ロックは自動削除しない。

`runOnce` は注入された fake executor のみを実行する。成功は結果保存後に確定する。例外と不正な実行結果は unknown。failure の再試行は `retryable === true` かつ `noSideEffects === true` に限定し、既定上限を 3 回とする。正式 Codex や既存 Bridge への接続は未実装。

## 2. TDD と回帰結果

| 段階 | RED の原因 | GREEN |
| --- | --- | --- |
| M1 永続化・状態・冪等性 | supervisor モジュール未実装 | 5/5 PASS |
| M2 排他・lease・heartbeat | claim 未実装 | 6/6 PASS |
| M3 fake executor・安全な再試行 | runOnce 未実装 | 8/8 PASS |

既存回帰 7 ファイル：`auto-handoff.test.js` 8 件、`auto-handoff-integration.test.js` 6 件、`bridge-background-isolation.test.js` 3 件、`bridge-partial-response.test.js` 3 件、`bridge-port-isolation.test.js` 3 件、`stream-cut-diagnostics.test.js` 2 件、`stream-cut-handoff.test.js` 2 件。**既存 27/27 PASS、Supervisor 19/19 PASS、合計 10 テストファイル・46/46 PASS。**

途中で一括 `node --test` 実行は Bridge コマンド解析エラーにより失敗。各テストファイルを個別実行した。依存がない隔離 worktree で一時的に `ws` モジュールが見つからなかったが、`npm ci --prefix <隔離 worktree> --ignore-scripts --no-audit --no-fund`（509 パッケージ追加）後に該当 2 ファイルを再試験し、6/6 と 3/3 PASS を確認した。途中の失敗は最終 PASS 件数に含めない。

## 3. ビルドとパッケージ

- 新規 JS の `node --check`：構文エラー報告なし。
- `npm --prefix <隔離 worktree> run build`：PASS。
- `npm --prefix <隔離 worktree> run package`：PASS。`hadome-0.1.22.vsix`、3943 ファイル、10.91 MB。
- VSIX 内の `extension/src/supervisor.js` を `unzip -Z -1` で確認済み。
- `git diff --check`：エラー報告なし。ただし未追跡ファイルには適用されない。
- 警告：VSIX に node_modules 3683 ファイルが含まれる。bundling 最適化は後続課題。npm 設定と非推奨依存関係にも警告がある。

## 4. 隔離と Git

元の作業領域 `end/t019-post-pr23-e2e-handoff` は、既存の `todo/todo.md` の変更 1 件と未追跡ファイル 15 件が残ったまま。隔離 worktree `t023-supervisor-mvp` に変更を限定した。commit、push、PR、merge、正式 Bridge のポート操作、実ブラウザー操作は実行していない。生成した依存、webview/dist、VSIX も隔離側にのみ存在する。

## 5. 受入保留・次回への引継ぎ

1. fake executor は注入関数であり、任意の関数を強制的にサンドボックス化するものではない。正式実行器を接続しないこと。
2. unknown、期限切れ、残存ロックの手動処置・オペレーター UI は未実装。自動的な引継ぎ・再試行は禁止。
3. 永続化のマルチホスト対応、電源断耐性、長時間負荷試験は未検証。
4. Supervisor の VSIX 同梱は確認したが、Extension UI と既存キューへの製品統合は未実施。
5. T-019 の実ブラウザー E2E は WARN／受入保留のまま。本報告をもって解消しない。
6. 次回は実装計画 `report/T-023_supervisor-implementation-plan_2026-11-19.md` と本報告を読み、元作業領域の変更を再確認する。正式実行器・外部副作用の扱いは別途承認を要する。

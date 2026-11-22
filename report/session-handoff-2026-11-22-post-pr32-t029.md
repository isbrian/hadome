# 2026-11-22｜PR #32 合併後工單盤點與 T-029 晚間交接

- task_id：T-029（連同 T-025～T-028、T-030～T-044 相依檢查）
- status：blocked（T-029 維持正式 `⏸️ 暫停`；本次唯讀調查完成，沒有宣稱實機驗收通過）

## summary

1. 已核對本機 `develop` 與 `origin/develop` 同步在 PR #32 合併提交 `3c886985d7e413e044c00392a446bf1edd5479d9`。此 PR 只合併 T-025 分析、T-026 規格草案及交接文件。
2. 正式 `todo/todo.md` 中 T-025／T-026 仍標 `待執行`，但文件交付已在 PR #32 合併；本輪遵守不擅自改既有工單列的約束，未修改派工表。T-026 仍是待人工核定草案，故 T-027 不可啟動；T-028 相依 T-027，亦不可啟動。
3. T-029 既有報告已附加晚間唯讀證據：9445 的隔離 Canary CDP 端點仍存活，但 `/json/list` 空白；未能證明 CUA 對隔離 Canary 和 VSCodium 有 UI 控制權。T-030～T-033 均須相依前置成立才能續行，T-034～T-044 亦受 T-033／其他相依約束。T-019 總驗收繼續暫停；T-008／T-009 的既有人工決策邊界不變。
4. 本輪僅進行唯讀程序、CDP 端點及可見瀏覽器清單檢查，沒有操作既有 ChatGPT 工作對話、正式 8765、隔離視窗 UI，亦未啟動新 Codex 任務或新的測試 Bridge。

## artifacts

- `report/T-029_隔離視窗可控性_2026-11-22_分析報告.md`：增加晚間續查紀錄。
- 本交接紀錄：本次盤點、證據及下一步。
- `report/T-026_Python_todo_runner_2026-11-22_規格草案.md`：仍待核定，未變更。

## verification

- 本輪 `git status` 起始為 `develop...origin/develop`，只有既有 T-019 未追蹤報告；PR #32 已合併。
- `lsof -nP -iTCP:8765 -iTCP:8799 -iTCP:9445 -sTCP:LISTEN` 列出正式 8765（VSCodium PID 94049）與 Canary 9445（PID 30959），未列出 8799。`lsof` 回傳 exit 1，因指定埠沒有全數命中，不能記作命令成功。
- `ps` 指認 PID 30959 為 Chrome Canary，啟動參數包含 `--user-data-dir=/private/tmp/hadome-t019-e2e-20261122-isolated/canary-profile` 與 `--remote-debugging-port=9445`。參數中的 `--load-extension` 不足以證明擴充成功載入。
- `curl` 至 9445 的 `/json/version` 顯示 Chrome 160.0.8177.0；`/json/list` 為 `[]`。這次 PID 與清晨不同，不能推論是同一測試程序。
- 連接的瀏覽器讀取介面列出一個既有 ChatGPT Bridge 工作對話，未找到可辨識的隔離測試分頁；未讀取或操作該對話，亦未驗證 CUA 原生 host 已恢復。
- 本交接檔新增、T-029 報告修改後，已再次執行 `git status --short --branch -uall`、`git diff --check`、`git diff --stat`、`git diff --exit-code -- todo/todo.md`、`shasum -a 256 todo/todo.md`、`git rev-parse HEAD origin/develop`。Git 位於 `develop`，與 `origin/develop` 同為 `3c886985d7e413e044c00392a446bf1edd5479d9`；已追蹤的差異僅 T-029 分析報告新增 8 行。另有既有未追蹤 T-019 報告與本交接檔；差異檢查沒有回報錯誤，正式派工表 SHA-256 仍為 `73e61f4bc733ac8de204e3ac9c4dd2132c61ea437e96550e3940982abc090b36`。本次驗證當下尚未提交或推送；後續文件入庫狀態須以實際 Git 提交與 PR 合併紀錄為準。

## warnings

- CUA 隔離視窗所有權仍未取得；CDP 可讀不等於可操作。不得繞過原 T-029 前置驗收，也不得觸碰正式工作對話。
- T-025／T-026 文件合併不等於 T-026 方案安全規格已獲核准；不能自動執行 T-027／T-028。
- 既有 T-019 未追蹤報告屬先前工作；不可誤納入新提交、清理或覆蓋。
- 本輪 T-029 僅交付補充報告；未取得新的實機 E2E PASS，亦未對產品程式碼做修正。

## next_action

1. 若 CUA browser host 恢復，先取得**隔離** Canary 與 VSCodium 可見視窗識別，對照 9445、隔離 profile 與專用 tab target；若選到正式視窗立刻停止。
2. 確認 T-029 控制權成立後，才能依相依條件推進 T-030（隔離擴充）、T-032（隔離 Bridge 8799）及後續 E2E-00；T-031 建立測試對話另需專用登入條件。
3. T-026 第 9 節未獲人工核定前，不進入 T-027；正式派工表及既有任務狀態不由本輪自行更動。

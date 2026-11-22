# T-025｜Python + todo.md 自動執行器可行性分析

- 日期：2026-11-22
- 工單：T-025（唯讀評估）
- 評估結論：**有條件可行；建議採 Python 3.9 相容、明確指定 task ID 的獨立 runner，並以 gitignored 執行紀錄保存執行期狀態。實際 Codex 自動執行尚待規格核定及安全驗證。**
- 範圍：僅閱讀程式、CLI help、既有測試與 Git 狀態；不安裝、不修改派工表、不實作 runner、不啟動 Codex 任務。

## 結果

1. 本機確認 `Python 3.9.6`、`codex-cli 0.170.0`。`codex exec --help` 顯示 `--sandbox`（read-only／workspace-write／danger-full-access）、`--json`、`--ephemeral`、`--output-last-message`、`--cd`；`codex --help` 顯示頂層 `--ask-for-approval`（on-request／never）。這是**CLI 介面確認**，沒有登入、啟動 agent 或進行真實權限測試。
2. 共用 [todo_table.py](/Users/brian/.agents/skills/dispatch-task-execution/scripts/dispatch_tools/todo_table.py) 已具備保留 UTF-8 內容、BOM／CRLF／末尾換行、解析多表格、辨識 escaped pipe、單格定位、錨點衝突偵測、插入列及原子取代的基礎。既有 [tests.py](/Users/brian/.agents/skills/dispatch-task-execution/scripts/dispatch_tools/tests.py) 以 `python3 .../dispatch-tools.py test` 執行，**37 passed、0 failed**。
3. 但 `edit_cell()` 刻意只容許「需求／需求／規格／說明」，不容許「狀態／暫停原因」；`parse_tables()` 只辨識 `ID` 與「需求」或「需求／規格」表頭；[workspace.py](/Users/brian/.agents/skills/dispatch-task-execution/scripts/dispatch_tools/workspace.py) 的狀態統計也只認繁中「狀態」。因此不能直接拿 UI 編輯 API 實作 runner 狀態更新，日文表頭尚無證據支持。
4. Hadome 的 [todo.md](../todo/todo.md) 這一系列使用「ID／狀態／類型／需求／驗收條件與交付／相依／重試次數／暫停原因」。既有 parser 可以透過 ID＋需求欄辨識，但若要更動執行狀態，須另加**僅 runner 可用**、經明確欄位白名單與預期舊值比對的安全寫入入口，不能放寬 UI 的 `EDITABLE_COLUMNS`。
5. 現有 [supervisor.js](../src/supervisor.js) 是 Node.js Supervisor MVP：專用 JSON 儲存、原子替換、排他目錄鎖、owner／runId／lease、unknown 不自動重跑，且只有 fake executor。這套不等於正式 Codex 執行器，也沒有與 Markdown 派工單共用單一寫入鎖。

## 方案選擇

| 方案 | 優點 | 主要代價與風險 | 可逆性 | 建議 |
| --- | --- | --- | --- | --- |
| A. 獨立 Python runner，重用 `todo_table` 解析概念並加受限狀態寫入 | 輕量、能配合既有 `todo.md` 與 Codex CLI、易做 fixture 測試 | 需另做跨程序鎖、版本相容、子程序隔離及人工復原 | 高 | **首選，待 T-026 核定** |
| B. 直接擴充全域 `todo_table.py` 與 UI，使狀態欄可編輯 | 減少部分重複實作 | 擴大共用工具與多 repo UI 的可寫權限，跨專案回歸風險大 | 中 | 不建議直接放寬既有 UI |
| C. 將正式 Codex 執行直接加入 T-023 Supervisor | 可重用 lease／owner／JSON 狀態機 | Supervisor 目前僅 fake executor，需新增真實執行器、狀態對映、Markdown 同步及產品隔離 | 中 | 保留為另案，不屬本 MVP |

上述比較是依已讀程式架構的質性判斷，未量測效能、工時或執行費用。若要跨 repo 重用 A，優先採**版本固定的共用唯讀解析模組或專案內最小 adapter**；禁止直接在全域技能中改寫狀態欄權限，以免牽連其他 repo。若外部模組無法使用，必須明確失敗或使用經測試的專案內實作，不可靜默切換解析規則。

## Markdown 表格與 Python 相容性

- Python 3.9.6 可使用 `pathlib`、`subprocess`、`tempfile`、`os.replace`、`typing` 等標準庫；若新程式採 `tomllib`、`match/case`、`X | Y` 型別聯集等較新語法，會不相容。現有 `todo_table.py` 的 `list[str]`、`tuple[...]`、`Path.is_relative_to` 適用 Python 3.9。
- 解析須檢查唯一工單 ID、唯一可識別表格／目標列、完整欄位數、預期表頭、現有狀態與前置依賴；有重複 ID、缺狀態欄、歧義或未知格式立即 fail-closed。
- 繁中表頭可依已讀程式處理；日文「状態／状況」等狀態欄及不同需求欄**目前未完成實測**，T-026 必須明列精確支援的表頭別名與 fixture，不採用模糊欄名猜測。
- 現有 `edit_cell()` 以舊行原文比對並只改一格，`save_lines()` 採同目錄暫存檔與 `os.replace`；但定位與寫檔是兩個階段，若其他程序在此期間另行寫入，仍有**讀改寫競態與遺失更新**。既有 UI 的 `threading.Lock` 只保護同一伺服器程序，不能視為跨程序排他。新 runner 不能只靠自己的 lock 宣稱已與 UI／人工編輯互斥；需要統一 writer／跨程序共同協定，或在競態無法排除時安全拒寫並交人工處理。
- 嚴格要求只寫指定目標列，不重新排版整份 Markdown；寫前、寫後以位元組雜湊／逐行對比檢查，保留其他列、BOM、換行及尾碼。若部分寫入後結果不明，保留證據並停止自動重試。

## Codex CLI 與安全執行邊界

- 必須明確傳入 `--task T-XXX`；不得自行挑第一筆、挑 runner 自身任務、忽略相依或接受未知狀態。只允許工單現有且明確可執行的狀態；「暫停／完成／等待人工決策／不認得的狀態」都拒絕啟動。
- 原則採最小權限 sandbox；`danger-full-access`、跳過 approval／sandbox 的危險旗標不納入。`workspace-write` 本身**不能保證**子 agent 不修改 `todo.md`、commit、push 或建立 PR；單靠 prompt 禁令不足，須隔離可寫工作區、限制命令／外部操作權限及留存稽核證據，不能以後置 `git diff` 當作可逆的安全防護。
- 正式啟動須以非互動模式取得可驗證的子程序退出碼與最終輸出（可用 `--json`、`--output-last-message` 的公開介面）；不得只因 exit 0、出現 success 文字、或輸出部分內容就標記工單完成。保留指令參數摘要、開始／結束時間、exit code、最終輸出存在性、工作區與檔案差異；日誌需遮蔽憑證與敏感 prompt。
- 逾時、中斷、訊號終止、啟動失敗、部分外部副作用或輸出缺失，一律判為結果未確定；不能直接重跑。需明確處理子程序群組終止、殘存程序、鎖仍在及重啟後的復原路徑。PID 或鎖過期不能單獨證明副作用不存在。
- 本輪沒有呼叫 `codex exec` 啟動任何任務，也沒有驗證實際 sandbox／approval 行為；正式權限與網路／費用影響均待後續獨立驗證。

## 執行權責、互斥與儲存方案

| 機制 | 權責界線 | 不可共用或假設 |
| --- | --- | --- |
| Python runner | 經明確 ID 啟動單次 Codex 工作、鎖定執行、寫執行紀錄、必要時對目標列做受限暫停標記 | 不自行驗收完成、不修改其他工單 |
| T-023 Supervisor | Node.js 專用儲存／fake executor 的管理與隔離測試 | 未整合正式 Codex、不能與 runner 共用未協商的鎖及狀態 |
| Ralph Loop | 若未來另行採用，僅可作明確核准的迭代策略 | 不得在迴圈中自動重挑工單、無限重試或跳過人工驗收；本輪未查實際安裝實作 |
| 人工派工／UI | 工單內容、相依、驗收與最終完成狀態的權威來源 | 不應與 runner 以各自不同的鎖同時寫同一檔 |

**建議採「一份 Markdown 工單台帳 + gitignored 執行日誌」**：`todo.md` 保存既有正式狀態與人工驗收；執行中的 owner、runId、子程序資訊、心跳、事件、最後輸出和恢復依據保存在可持久化、限制權限的本機獨立日誌。單靠 Markdown 不足以保存故障診斷與操作稽核；但日誌不進 Git，跨機移交需另行保護與交接。Hadome 現有 [.gitignore](../.gitignore) 未包含 runner 專用日誌路徑，T-027 實作前應新增明確忽略規則，並在 T-028 驗證 runner 不會進 VSIX。

## T-026 最小規格建議與決策點

1. 明確列出可執行狀態、正規化規則、日文表頭／狀態別名、空白及尾碼處理；未知值全部拒絕。
2. `--task` 必填；核對 task ID 唯一性、相依與防止選取 runner 本身；啟動前記錄完整預期列原文／雜湊。
3. 一次只容許一名 runner 執行，鎖需具跨程序與異常終止偵測；發現不明 owner 不搶鎖、不重跑。
4. 明確定義可寫工作區和 Codex sandbox／approval 設定；未取得人工許可的外部副作用不得執行。子 agent 不准改派工表、commit、push、PR，並需有可驗證的技術隔離。
5. 成功僅表示 executor 產出可供人工驗收的結果，不代表 `✅ 完成`；只有既有人工驗收程序可更新完成狀態。
6. 失敗或結果不明使用既有「⏸️ 暫停／等待人工決策」語意，在有「暫停原因」的表格才寫入；無對應欄位就 fail-closed 並留下日誌供人工處理。
7. 逐項測試成功、失敗、無最終輸出、逾時、取消、重複啟動、衝突、不同表頭、位元組保持及人工復原；正式 todo 的雜湊必須不變。
8. T-027 必須等 T-026 方案核定後才實作；不得以既有 37 個 UI 自測代替 runner 或真實 CLI 驗收。

## 驗證

- 本輪讀取：Hadome [todo.md](../todo/todo.md)、[supervisor.js](../src/supervisor.js)、[.gitignore](../.gitignore)、T-023／T-024 既有報告與共用 `dispatch_tools` 解析、UI、工作區、測試程式。
- `python3 --version` → `Python 3.9.6`。
- `codex --version` → `codex-cli 0.170.0`；`codex --help` 和 `codex exec --help` 讀取完成。
- `python3 /Users/brian/.agents/skills/dispatch-task-execution/scripts/dispatch-tools.py test` → **37 passed, 0 failed**（既有共用工具自測，非 runner 測試）。
- `git diff --check` 無輸出；報告建立後 `git status --short --branch -uall`：`develop...origin/develop`，共有兩份未追蹤報告：既有 [T-019 分析報告](T-019_自動上下文交接E2E_2026-11-22_0444_分析報告.md) 與本次 T-025 報告。未修改 T-019 報告。

## 風險與缺口

- Codex 正式執行與真實 sandbox、approval、安全禁令、逾時復原及費用：**未驗證**。
- 日文表頭與各種狀態尾碼：**未用目標 fixture 驗證**。
- 外部人工／UI 同時修改正式 Markdown 的跨程序互斥：**現有程式未解決**。
- 本輪只建立 T-025 評估報告，不修改 [todo.md](../todo/todo.md) 任務狀態、既有模組、`.gitignore` 或產品程式。
- T-019／T-029 的隔離瀏覽器阻塞仍獨立存在，本報告不視為解除。

## 下一步

依本報告進入 **T-026 規格與人工決策**。待明確核定權限、支援的表格格式、跨程序寫入策略、隔離路徑與恢復流程後，再進行 T-027 開發及 T-028 的 fixture／真實 CLI 驗證。

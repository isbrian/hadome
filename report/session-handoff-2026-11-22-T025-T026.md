# 2026-11-22｜Hadome T-025／T-026 交接紀錄

- task_id：T-025、T-026
- status：T-025 唯讀分析已交付；T-026 最小規格**草案已建立、待人工核定**。正式 `todo/todo.md` 內原有工單狀態保持不變；T-027 與 T-028 未啟動。

## summary

1. T-025 完成 Python + Markdown 派工單 runner 的可行性分析；方案以獨立 Python 3.9 相容 runner、明確 `--task`、gitignored 執行紀錄及人工驗收為候選，並保留 T-023 Node.js Supervisor fake executor 與 T-019 實機 E2E 的獨立邊界。
2. T-026 已草擬新增工單／明確選取、狀態保護、跨程序鎖、子 agent 權限、Codex CLI 呼叫、失敗與不明結果的人工復原、以及 T-028 fixture 驗收矩陣。MVP 預設不由 runner 自動追加、不自動挑第一筆、不自動標完成。
3. 目前既有 UI 的鎖只在單一服務程序內有效；runner 私有鎖無法阻止其他 writer 同時編輯正式 Markdown。因此**未有共用互斥協定前，不能開放 runner 自動寫正式派工表**。
4. 子 agent 對正式 todo、Git 控制資料、憑證、其他 repo 和正式 Bridge 的可寫範圍尚未在真實 Codex sandbox 確認；提示文字本身不構成隔離。正式 Codex 執行仍須明確核定並實測。

## artifacts

- `report/T-025_Python_todo_runner_2026-11-22_分析報告.md`：可行性分析。
- `report/T-026_Python_todo_runner_2026-11-22_規格草案.md`：候選實作／驗收規格與待核定決策。
- 本文件：交接摘要。

## verification

- 已執行 `python3 --version` → `Python 3.9.6`；`codex --version` → `codex-cli 0.170.0`。
- 已執行 `codex --help`、`codex exec --help`；`exec` 顯示 `--sandbox`、`--cd`、`--json`、`--output-last-message`。頂層 help 有 `-a/--ask-for-approval`，但 `exec --help` 未顯示直接對應選項；已在 T-026 草案標示不能假定可用，待後續安全驗證。
- 已執行共用派工工具 `dispatch-tools.py test`，結果 **37 passed／0 failed**；這是**既有工具測試**，不是新 runner 或正式 Codex E2E 測試。
- 已唯讀抽查 `workspace.yaml` 列出的其他 4 份專案派工檔開頭；所見表頭為繁中，不能當成日文表頭驗證。既有共用 `todo_table.py` 未提供經確認的日文狀態欄相容性。
- T-026 草案建立及修改後曾執行 `shasum -a 256 todo/todo.md`，結果與基線一致：`73e61f4bc733ac8de204e3ac9c4dd2132c61ea437e96550e3940982abc090b36`。
- 交接檔建立後已再次執行 `shasum -a 256 todo/todo.md`、`git diff --check`、`git diff --exit-code -- todo/todo.md` 及 `git status --short --branch -uall`。正式派工表雜湊仍為 `73e61f4bc733ac8de204e3ac9c4dd2132c61ea437e96550e3940982abc090b36`，兩項差異檢查均無輸出；Git 為 `develop...origin/develop`，只有 4 份未追蹤文件：既有 T-019 分析報告、本次 T-025 分析報告、T-026 規格草案及本交接檔，未發現已追蹤檔案異動。

## warnings

- T-026 為**草案**，非已批准的安全規格；T-027 實作與 T-028 正式驗收沒有開始。
- 未實際執行 `codex exec` 任務，不能宣稱登入、approval、sandbox、子程序終止或費用邊界已受測。
- 共用 writer／跨程序原子比較寫入、日文精確表頭、執行失敗時自動暫停的條件與授權、日誌保留期均待決策。
- T-019／T-029 的實機 E2E 前置條件仍獨立保留，不因本系列報告解除。
- 不修改任何正式 `todo/todo.md` 既有列或狀態，也不 commit／push／開 PR；既有未追蹤 T-019 報告維持原狀。

## next_action

1. 人工審閱 T-026 第 9 節，優先核定隔離工作區與可寫範圍、正式 Markdown 寫入者互斥或純人工更新、可執行表頭與狀態白名單、失敗／中斷復原授權與驗收責任。
2. 核定後才進入 T-027，先在隔離 fixture／工作區實作最小 runner；不得直接改正式派工表或啟動正式服務。
3. 再依 T-028 驗收矩陣測試追加、狀態、鎖、衝突、重試禁止、真實 CLI，以及正式 todo 雜湊與非目標列位元組不變。真實 CLI 無法安全測試時應明確列未驗證，不可用 fake executor 冒稱通過。

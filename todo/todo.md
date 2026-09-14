# 派工單

更新時間：2026-09-15

| ID | 狀態 | 類型 | 需求 | 說明 | 重試次數 | 暫停原因 |
|----|------|------|------|------|----------|----------|
| T-005 | ✅ 完成 | 實作 | 拆解 handleRun() 巨型函式 | 詳見規格書 todo/spec/拆解handleRun.md | 0 | - |
| T-006 | ✅ 完成 | 實作 | 拆解 makeTools() 巨大物件（範圍縮小為 8 個無狀態工具，詳見執行報告） | 詳見規格書 todo/spec/拆解makeTools.md | 0 | - |
| T-007 | ✅ 完成 | 實作 | 補上測試/CI 基礎建設（lint 另開工單，詳見執行報告） | 詳見規格書 todo/spec/測試lint-CI基礎建設.md | 0 | - |

備註：本專案 `main` 合併一律人工執行，見 [CLAUDE.md](../CLAUDE.md)。本派工單的 Auto-Merge 僅適用於 feature 分支 → `develop`，不涉及 `main`。

## 暫停中：待重貼到上游基線的自訂功能

2026-09-15，產品層已重設到上游 `daimou1028/hadome` 的 v0.1.18（詳見下方「基線重設」）。
以下自訂功能在此次重設中**一併暫停**，程式碼完整保存於 tag `archive/0.1.10.2-pre-upstream-sync`（= 重設前的 `develop`，commit `65639fb`）。

| ID | 狀態 | 需求 | 保存位置 | 重貼備註 |
|----|------|------|----------|----------|
| T-101 | ⏸ 暫停 | `chatgptBridge.pairTab` 命令 | archive tag 的 `package.json` + `extension.js` | 小且獨立，建議先做 |
| T-102 | ⏸ 暫停 | sidebar view routing 修正 | 分支 `end/sidebar-view-routing-0.1.10.2`（`5debca8`） | 小且獨立，建議先做；需先確認上游 0.1.14 的「空頁重用」是否已涵蓋 |
| T-103 | ⏸ 暫停 | 多席位 bridge-slots | [openspec/specs/bridge-slots/spec.md](../openspec/specs/bridge-slots/spec.md)、`a675cfb` | 動到 `src/bridge.js` 與 `src/portlock.js`，上游兩支都改過，需重新設計 |
| T-104 | ⏸ 暫停 | 每次允許按鈕 command-permission | [openspec/specs/command-permission/spec.md](../openspec/specs/command-permission/spec.md) | **重貼前先對照上游**：0.1.16 / 0.1.17 已改寫權限層並補了 11 個漏洞，可能已部分實現 |
| T-105 | ⏸ 暫停 | `handleRun` 重構（T-005 的成果） | archive tag 的 `extension.js` | 最大一項，上游在同區域也有改動，放最後做 |
| T-106 | ⏸ 暫停 | `src/tools.js` → `src/tools/query-tools.js` 拆分（T-006 的成果） | archive tag 的 `src/tools/query-tools.js` | 同上，上游 `src/tools.js` 已大幅改寫 |
| T-107 | ⏸ 暫停 | `test/` 4 支測試改寫至上游 API | `test/` 仍在版控內，目前全紅 | 完成後移除 CI `npm test` 的 `continue-on-error` 與 `timeout-minutes` |

### 目前 `npm test` 失敗清單（2026-09-15，基線 0.1.18）

`test/bridge-lifecycle.test.js` 8 項全數失敗，且 **process 不會退出**（測試留下沒關閉的 WebSocket server）：

| # | 測試 | 失敗原因 |
|---|------|---------|
| 1 | hello selects the first tab and rejects a different target | `Cannot read properties of undefined (reading 'connect')` |
| 2 | done resolves ask and error rejects ask while cleaning the waiter | 同上 |
| 3 | disconnect rejects an unanswered request and close is idempotent | 同上 |
| 4 | 塞がった枠は次の席へ回る | port 8765 被執行中的 VSCodium 佔用（環境因素，非 API 變動） |
| 5 | 回る時は予約枠 8767〜8769 を飛ばす | 同上 |
| 6 | 席が全部埋まっていたら断る | `portlock.mainPorts is not a function`（多席位 API，上游沒有） |
| 7 | 組んだ窓は譲れと頼まれてもタブを手放さない | `Cannot read properties of undefined (reading 'connect')` |
| 8 | 組んでいない窓は今まで通り譲る | 同上 |

`tools.test.js` / `portlock.test.js` / `protocol.test.js` 因 process 卡住未能跑完，重貼測試時需重新確認。

### 基線重設（2026-09-15）

- 上游：`daimou1028/hadome` v0.1.18（`4a02cb4`）；分岔點 `5da7f76`（上游 0.1.10）。
- 本地 `upstream` remote 已建立，日後同步：`git fetch upstream --tags`。
- 發佈流程見 [skills/package/SKILL.md](../skills/package/SKILL.md) §6。

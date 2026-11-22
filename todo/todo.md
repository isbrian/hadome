---
scope:
  type: single-repo
default_branch: develop
task_type: implementation
---

# 派工單：多席位分頁綁定

> 分支：`feat/多席位分頁綁定`（從 `develop` 切出；T-001~T-005 已 commit 於 `f92c400`，**本地分支，尚未 push**）
> 核准計畫：`/Users/brian/.claude/plans/mighty-questing-moth.md`
> 建立：2026-09-21

## 背景

hadome 原本是「一台機器一個 hadome」：主橋固定綁 8765、子代理池固定 8810 起算、瀏覽器 CDP 埠與 profile 全機唯一，第二個專案視窗開不起來。而且 `claim.json` 的設計目標與需求**相反**——它讓缺分頁的視窗去搶別人的分頁。

目標：同帳號下最多 **4 個專案視窗**同時運作，各自綁死自己的 chat 分頁、自己的 2 個子代理分頁、自己的瀏覽器。

### 重要前情：這個 fork 做過一次又被覆蓋

commit `a675cfb feat: 多席位——讓多個編輯器視窗各自對談`（PR #15）實作過同一件事，後來在 `6160cdc chore: 以上游 v0.1.18 重設產品層基線` 被整個覆蓋放棄。本次實作**刻意沿用該版的詞彙與結構**（`paired` / `pairUrl` / `pairTab` / `mainPorts` / `slotIndexOf` / `subBaseFor`），i18n 字串也直接沿用。

要看舊版怎麼寫：

```bash
rtk proxy git show a675cfb -- src/portlock.js src/bridge.js extension.js
rtk proxy git show a675cfb -- openspec/changes/multi-slot-bridges/design.md   # 設計文件
rtk proxy git show a675cfb -- test/portlock.test.js                          # 舊測試（test/ 現已移出版控）
```

**與舊版的差異（本次新增，不要照抄舊版）**：

| 項目 | 舊版 `a675cfb` | 本次 |
|------|---------------|------|
| 席位數 | 8 席（PORT_TO=8775） | **4 席**（PORT_TO=8771） |
| 席位分配 | 純靠 EADDRINUSE 漫遊，不記憶 | **`slots.json` 黏著，首次登記為準** |
| 子埠區塊 | `SUB_BLOCK = 8` | **`SUB_BLOCK = 4`**（`subAgents` 上限就是 4） |
| 瀏覽器 | 未處理，全機共用 9444 | **每席一埠一 profile** |
| content.js | `PORT_TO` 放寬到 8775 讓未釘分頁掃全段 | **維持 8765**，未釘分頁只掃 slot 0；釘住的分頁**不再退回掃描** |
| 台帳 | 未處理 | 補記 `席` / `持ち主` |

## 埠位表

`RESERVED` 8767-8769 跳過。slot 0 刻意等於現行值，**單視窗使用者行為完全不變**。

| slot | 主埠 | 子埠（用前 2 個） | CDP | 瀏覽器 profile |
|------|------|------------------|-----|----------------|
| 0 | 8765 | 8810, 8811 | 9444 | 現行路徑（不變） |
| 1 | 8766 | 8814, 8815 | 9445 | 現行路徑 + `-1` |
| 2 | 8770 | 8818, 8819 | 9446 | 現行路徑 + `-2` |
| 3 | 8771 | 8822, 8823 | 9447 | 現行路徑 + `-3` |

## 任務表

| ID | 狀態 | type | 需求 | 說明 | 重試次數 | 暫停原因 |
|----|------|------|------|------|---------|---------|
| T-001 | ✅ 完成 | 實作 | portlock 席位分配 | `mainPorts` / `slotIndexOf` / `subBaseFor` / `cdpFor` / `profileSuffixFor` / `slots.json` 黏著 | 0 | - |
| T-002 | ✅ 完成 | 實作 | bridge 配對模式 | `paired` 選項、`pollClaim` 與 `askTimer` 短路、`liveOthers` 濾子橋、`pairUrl()`、`portBusy` 標記、protocol 61 | 0 | - |
| T-003 | ✅ 完成 | 實作 | 分頁不漂移 | content.js 移除釘住後的 fallback、protocol 61、manifest 0.61.0 | 0 | - |
| T-004 | ✅ 完成 | 實作 | 瀏覽器隔離 | `browser.枠を決める()`、profile 尾碼、台帳補 `席`/`持ち主` | 0 | - |
| T-005 | ✅ 完成 | 實作 | extension 接線 | `takeSeat()`、`portNow()`、換席重試、`pairTab` 命令、pool base 依席切塊、i18n ×3 + nls ×3 | 0 | - |
| T-006 | ✅ 完成 | 實作 | 等分頁時主動提示配對 | `note.pairHint`，8 秒後才提示；報告見 `report/T-006_*_執行報告.md`（commit `175779d`） | 0 | - |
| T-007 | ✅ 完成 | 文件 | README ×3 補多開章節 | 三語各加一節 + 同版警告；報告見 `report/T-007_*_執行報告.md`（commit `fe6ab02`） | 0 | - |
| T-008 | ⏸️ 暫停 | 實作 | 人工端對端驗收 | 9 項中已自動驗證 1 項、部分 2 項、待人工 7 項；詳見 `report/T-008_*_分析報告.md` 與 `test/seat-check.js` | 0 | 等待人工決策 |
| T-009 | ⏸️ 暫停 | 實作 | commit（PR 不做） | commit 全部完成；**使用者 2026-09-22 明確指示「不跑 PR，在分支中完成」**，合併時機由使用者自行決定 | 0 | 等待人工決策 |
| T-010 | ✅ 完成 | 實作 | 分支自我審查（code-review） | verdict `warn`（0 fail / 2 warn / 3 info）；2 warn + 1 info 已修（commit `22a74b4`），報告見 `report/T-010_*_審查報告.md` | 0 | - |

---

## T-006 等分頁時主動提示配對

**為什麼**：目前若 slot 0 被別的視窗占著，本視窗會自動換到 8766，但**未釘住的 chatgpt.com 分頁只掃 8765**，所以會一直等不到分頁。使用者必須自己知道要執行「開一個與本視窗配對的分頁」。這是本功能最大的可用性缺口。

**做什麼**：`ensureBridge()` 在 `post({ type: 'note', text: t('note.waitingTab', ...) })` 那行（[extension.js](../extension.js) 內，`await s.bridge.waitForTab()` 之前），當 `portlock.slotIndexOf(s.bridge.port) > 0` 時，改用一個新的字串鍵（例如 `note.waitingPairedTab`），內容要帶上 `s.bridge.pairUrl()`，直接告訴使用者「這個視窗在 8766，請執行『開一個與本視窗配對的分頁』，或自己開這個網址」。

**注意**：
- 新字串要同時寫進 `src/i18n/ja.js`、`en.js`、`zh-tw.js` 三本（**ja 是事實上的母語字典，先寫 ja**）
- 不要硬寫字串，一律走 `t()`
- `pairUrl()` 已在 [src/bridge.js](../src/bridge.js) 的回傳物件上

---

## T-007 README ×3 補多開章節

三份 README **改一份就要改三份**：[README.md](../README.md)（英）、[README.ja.md](../README.ja.md)（日）、[README.zh-TW.md](../README.zh-TW.md)（繁中）。

要寫的內容：

1. 設定表裡 `port`（繁中版在第 169 行附近）那一列的說明，補上「留空 = 自動取席」
2. 新增一小節說明多開：埠位表（上面那張）、一個專案一個分頁、每個視窗各自 2 個子代理、`pairTab` 命令怎麼用
3. 提醒：**編輯器擴充與瀏覽器擴充必須同版**（protocol 61），舊分頁不會被自動升級，要去 `chrome://extensions` 重載擴充 + 重載 chatgpt.com 分頁

舊版 `a675cfb` 也改過這三份 README（各約 20 行），可以參考措辭：

```bash
rtk proxy git show a675cfb -- README.zh-TW.md
```

---

## T-008 人工端對端驗收

**這一項無法由 AI 代跑**——需要真人在本機裝兩份擴充、開兩個編輯器視窗、看瀏覽器分頁。逐項做完並記錄結果。

**產物已經建好了（2026-09-22，版本 `0.1.20.1`），不用重跑打包**：

| 產物 | 驗證過的事 |
|------|-----------|
| `hadome-0.1.20.1.vsix` | VSIX 內部版本 `0.1.20-1`、`pairTab` 已註冊、席位程式碼在內、協定 61、`todo/` `report/` `test/` 未被打包 |
| `hadome-chrome-0.61.0-3.zip` | manifest 0.61.0 與工作樹一致、只有 4 檔、content.js 協定 61 |

安裝：

```text
編輯器 → 擴充功能 → … → 從 VSIX 安裝… → hadome-0.1.20.1.vsix
chrome://extensions → 重新載入擴充（指向 hadome-chrome-0.61.0-3.zip 解壓後的資料夾）
chatgpt.com 分頁也要重載 ← 協定 60→61，只做前一半不夠
```

要重建的話：`npm run package`（會連帶重建 Chrome ZIP，檔名自動加尾碼不覆蓋舊檔）。

| # | 驗收項 | 判定 |
|---|--------|------|
| 1 | **slot 0 回歸**（最重要） | 只開一個專案視窗 → 面板在 8765 連上**既有的**普通 chatgpt.com 分頁，不需要任何 URL 參數<br />＃OK |
| 2 | slot 0 子代理 | 跑一次含 2 個子代理的任務 → 子分頁開在 8810/8811<br />＃有瑕疵<br />＃已實際執行 1 次包含 2 個子代理的任務。兩個子代理都有被建立，但兩者皆因上游回傳 404 而失敗，未取得子代理結果；另外也驗證了本機 127.0.0.1:8810 無法連線，因此目前無法確認 8810/8811 子分頁有成功開啟。這次結果應視為「已觸發 2 個子代理，但子分頁/服務未成功啟用」。<br />＃已完成一次含 2 個子代理、且未指定任何子分頁 port 的任務測試。兩個子代理都有實際啟動；子代理 1 成功完成 web/ 前端唯讀盤點，確認 React 19 + TypeScript + Vite + Ant Design + Playwright 等架構；子代理 2 在執行 api/ 後端盤點時遭遇上游 404（cf-ray=a3f161c95ce3db55-TPE）而失敗。此次未設定 8810/8811 或任何固定 port，且未修改任何專案檔案。 |
| 3 | slot 0 瀏覽器 | `browser` 工具開一頁 → 仍用 9444 與原 profile（**登入狀態還在**）<br />＃ＯＫ<br />＃已完成 browser 工具開頁測試：成功開啟 https://example.com/，取得 tab=16470603A512AFDE98232C0961267B13，並透過 browser_read 成功讀到 Example Domain 內容，確認分頁可正常操作。此次沿用既有 browser 工作階段；工具回傳本身未另外顯示 9444 port 或 profile 路徑，因此這兩項沒有額外獨立驗證。 |
| 4 | 多開 | 再開第二個專案視窗 → 報「在 8766 等分頁」→ 執行「開一個與本視窗配對的分頁」→ 分頁連上。`rtk proxy lsof -nP -iTCP:8765,8766 -sTCP:LISTEN` 各一個 listener；`ls ~/.chatgpt-bridge/ports/` 有 `8765.json`、`8766.json`、`slots.json`<br />＃ＯＫ<br />VSCodium  57031 brian   33u  IPv4 0x4ff378c1a735d467      0t0  TCP 127.0.0.1:8765 (LISTEN)<br/>VSCodium  79789 brian   39u  IPv4 0xa8c934c4274c9a9a      0t0  TCP 127.0.0.1:8766 (LISTEN) |
| 5 | **不互搶** | 兩視窗都連好 → 關掉第二視窗的分頁 → 等超過 5 秒（`CLAIM_AFTER_MS`）→ 第一視窗的分頁**必須不動**，且 `~/.chatgpt-bridge/ports/claim.json` 不該出現<br />ＯＫ |
| 6 | **不漂移** | 第二視窗的分頁留著、關掉第二個編輯器視窗 → 該分頁 console 應持續重試 8766 並退避，**不得**跑去接 8765<br />＃ＯＫ |
| 7 | 子代理不撞 | 兩視窗同時各跑 2 個子代理 → 子分頁分別在 8810/8811 與 8814/8815，四份結果都回得來<br />＃失敗<br />已測試同時啟動 2 個子代理（8814 / 8815）。兩個呼叫皆送出，但執行端均回傳 HTTP 404，並出現 signal is aborted without reason，因此本次未取得子代理實際檢查內容；未修改任何工作區檔案。<br />已測試 2 個未指定 port 的子代理；兩者皆回傳 HTTP 404（signal is aborted without reason），未取得實際檢查結果，也未修改工作區檔案。<br />終了コード 7 --- 8810 final --- curl: (7) Failed to connect to 127.0.0.1 port 8810 after 0 ms: Couldn't connect to server --- 8811 final --- curl: (7) Failed to connect to 127.0.0.1 port 8811 after 0 ms: Couldn't connect to server |
| 8 | 瀏覽器隔離 | 兩視窗各用一次 `browser` → `rtk proxy lsof -nP -iTCP:9444,9445 -sTCP:LISTEN` 各一個；`rtk proxy tail -2 ~/.chatgpt-bridge/run-ledger.ndjson` 兩筆的 `席`/`持ち主` 不同；**在第二視窗關瀏覽器，第一視窗的瀏覽器必須還活著** |
| 9 | 滿席 | 開第 5 個專案視窗 → 出現 `seat.allTaken` 的提示並列出 4 個持有者路徑，不該拋未處理的例外 |

**黏著性**已用純 node 驗過（見下方「已驗證」），但仍建議實機確認一次：關掉第二視窗再開同一個專案 → 應再次拿到 8766。
＃有拿到，但是跟編輯器確認時會認為自己帶入的port是預設值8765

---

## T-009 commit + PR 回 develop

- commit 訊息用 **fork 自己的風格：繁體中文 conventional commits**（例：`feat: 多席位——一個專案一個分頁，各帶 2 個子代理`）
- `gh pr create` **一律加 `--repo isbrian/hadome`**（這是 fork，預設會指向上游 `daimou1028/hadome`，錯誤訊息會誤導）
- base 是 `develop`
- **`develop` → `main` 由使用者親自在 GitHub 合併**，不要代為 merge / push main
- 合併進 `develop` 之後：本地分支改名 `end/多席位分頁綁定` 保留，遠端用 `gh api -X DELETE repos/isbrian/hadome/git/refs/heads/feat/多席位分頁綁定` 刪除
- 推送驗收標準是 **遠端 ref hash == 本地 HEAD hash**，用 `rtk proxy git ls-remote --heads origin` 對照，不要信 push 回報的 up-to-date

---

## 已完成項目的技術細節（T-001 ~ T-005）

改動檔案（13 個）：

| 檔案 | 改了什麼 |
|------|---------|
| [src/portlock.js](../src/portlock.js) | `PORT_TO` 8765→8771；新增 `SUB_BLOCK=4`、`CDP_BASE=9444`、`mainPorts()`、`slotIndexOf()`、`subBaseFor()`、`cdpFor()`、`profileSuffixFor()`、`slotsPath()`、`readSlots()`/`writeSlots()`、`heldMainPorts()`、`leasePort()`、`rememberPort()` |
| [src/bridge.js](../src/bridge.js) | `openBridge({ paired })`（可傳函式）；`pollClaim()` 與 `waitForTab()` 的 `askTimer` 在配對模式短路；`liveOthers()` 用 `slotIndexOf >= 0` 濾掉子橋的鎖；新增 `pairUrl()`；`retireTab()` 改送 `openedPort`（原本送閉包的 `port`，roam 過會送錯）；埠位被占用的錯誤加 `e.portBusy = true`；`EXPECTED_TAB_PROTOCOL` 60→61 |
| [chrome-extension/content.js](../chrome-extension/content.js) | 移除 `pinnedFallback`/`scanningAfterPinnedFailure`/`PINNED_FAILURE_LIMIT`/`clearPinnedPort`（`clearPinnedPort` 本來就是死碼）；釘住的分頁改成只重試該埠並退避；`TAB_PROTOCOL` 60→61 |
| [chrome-extension/manifest.json](../chrome-extension/manifest.json) | 0.60.10 → 0.61.0 |
| [src/browser.js](../src/browser.js) | `const PORT` → `let PORT`；新增 `枠を決める({ port, slot, suffix, workspace })`；`隔離した設定ファイルの道()` 接席位尾碼；台帳補 `席`/`持ち主`；`module.exports` 移除 `PORT`（無人使用），改出 `枠を決める` / `口()` / `設定ファイルの道()` |
| [extension.js](../extension.js) | `require('./src/portlock')`；`seatPort` / `席は自動` / `portNow(c)` / `takeSeat()`；`settings().port` 改走 `portNow`；`PAIRED_KEY` + `pairedFor()`；`次の空き席()` / `席に合わせる()`；`ensureBridge(s, port, { waitTab, 試した })` 支援埠位被占用時換席重試；pool base 與 `cleanupPort` 改用 `subBaseFor`；子橋固定 `paired: true`；新增 `pairTab()` 與命令註冊；`activate()` 內 `takeSeat()` |
| [package.json](../package.json) | 註冊 `chatgptBridge.pairTab` |
| package.nls ×3 | `command.pairTab.title` |
| src/i18n ×3 | `note.waitingTab`/`tabResumed`/`tabConnected` 加 `{port}`；新增 `pair.opened`、`pair.failed`、`seat.allTaken`；`br.portBusy` 補「想兩個視窗同時用就執行配對命令」 |

### 關鍵設計決策（不要改掉）

- **slot 0 = 8765 = 現行值**，未釘住的分頁只掃 8765。這保證單視窗使用者完全無感。
- **claim/handover 只在 slot 0 有效**。`pairedFor()` = 「workspaceState 的 `pairedTab` 旗標為真」**或**「本視窗的埠不是 8765」。子橋一律 `paired: true`（舊版順手修掉的既有 bug：子橋原本也會參與搶分頁）。
- **`rememberPort` 是「首次登記為準」**，不會因為某次臨時被占用就改寫記錄——否則釘在 URL 上的 `?bridge_port=` 會失效。
- **使用者顯式設定 `chatgptBridge.port` 時完全不取席、也不換席重試**（用 `config.inspect()` 判斷有沒有 workspace/global 值）。
- **`browser.枠を決める()` 必須在 `activate()` 之後、拿到實際埠之後才呼叫**——`src/tools.js:7` 在 extension.js 載入時就 require 了 browser.js，所以 `process.env` 改不動它，只能靠 setter。目前呼叫點在 `ensureBridge()` 成功後的 `席に合わせる()`。

### 已驗證

| 檢查 | 結果 |
|------|------|
| `node --check` 全部 8 個 .js + 5 個 .json parse | 全過 |
| `npm run build` | exit 0，輸出含「束ねました」 |
| `npm run package` | exit 0，產出 `hadome-0.1.20-1.vsix` |
| portlock 純 node 煙霧測試 | 埠位表與批准計畫完全一致；A=8765 / B=8766；同專案第二視窗拿 8770 但**記錄不被改寫**；全部釋放後 A 拿回 8765；滿席回 `port: null` 並附 4 個持有者 |

**沒有驗證的**：任何需要真實 VS Code / 瀏覽器的行為，全在 T-008。本專案沒有測試框架（無 `test` script，`test/` 已移出版控），`npm run build` + `npm run package` 是 CI 的替代項。

### 已知風險

1. **protocol 61 是破壞性變更**：舊的 chatgpt.com 分頁（protocol 60）連上後會被記進 log，而且在 slot 0 不會回應 handover。使用者必須重載 Chrome 擴充**並**重載分頁，只做一件不夠。T-007 的 README 要寫清楚。
2. **T-006 沒做完之前，多開的可用性是差的**：第二個視窗會安靜地等一個永遠不會來的分頁。
3. `slots.json` 沒有提供 UI 或命令可以重設。要換席只能手動刪 `~/.chatgpt-bridge/ports/slots.json`。目前判斷 YAGNI，若使用者反映再做。
4. #### 同帳號 4 專案 × 3 分頁 = 最多 12 個並行對話，**很可能撞到 ChatGPT 帳號側的速率限制**。這是使用時的節制問題，不是程式問題，但 README 值得提一句。


---

## T-019 自動コンテキスト引き継ぎ：実ブラウザー E2E 受け入れ待ち（2026-11-18 更新）

> この節は 2026-09-21 に作成された多席位タスク T-001～T-010 とは別件である。既存の T-008／T-009 の判定・履歴は変更しない。

| ID | 状態 | type | 要件 | 検証結果・次の作業 | 再試行回数 | 保留理由 |
| --- | --- | --- | --- | --- | --- | --- |
| T-019 | ⏸️ 保留（實機 E2E 未完成） | 驗證索引 | 自動上下文交接真實瀏覽器驗收總追蹤 | 保留已完成的離線回歸與歷史證據；實機前置、E2E-00、E2E-01～11 已拆為 T-029～T-044，每張子工單只處理一個前置或一個案例。依相依欄逐項執行；所有子項完成且驗收報告更新後，才回來結案 T-019。詳見[既有驗收報告](../report/T-019_ブラウザー自動引き継ぎE2E_2026-11-15_検証報告.md) | 0（拆分後尚未開始實機案例） | 隔離測試環境與實機案例尚未逐項驗收；依賴子工單完成前不得宣告總驗收完成 |

**2026-11-18 継続検証：** 独立 VSCodium で Bridge 8799 の LISTEN とブラウザー拡張 0.62.0 からの hello を確認したが、既存の ChatGPT 会話「整理接手進度」が 8799 に接続し、正式 8765 へタブを譲るログを検出。専用テストタブの所有権を証明できないため実機切り替えを中止した。専用 Canary の起動と隔離ブラウザーの ChatGPT 操作は安全制限で拒否。Node.js 回帰 21/21 PASS、関連構文検査 PASS。独立 VSCodium を終了し、設定から一時的な `revealOnStart` を削除、8799／9445 の停止と正式 8765 の継続を確認。詳細は検証報告第 18 節。E2E-00 は WARN、E2E-01～09 は未実施のまま受け入れ保留。

**未解決の関連事項：** 過去の Bridge ログにある `signal is aborted without reason` の原因切り分け。T-019 の正式受け入れには E2E-00 の前提確保後、E2E-01～09 の実機証拠と設定復元・Git 状態の確認が必要。モックテスト合格のみで T-019 を完了に変更しない。

**2026-11-18 追加確認：** CDP 9444 の独立 Canary で実際に `chatgpt.com` を読み込んだが、ログインボタンが表示され、対話入力欄はなかった。9444 のプロファイルに Hadome 対象タブ拡張機能も登録されていなかった。通常 Canary には Hadome 拡張機能が存在するものの、既存の 8765 接続を保護するため試験対象にしない。専用の VSCodium／Bridge／Project／旧対話 ID も未確保。E2E-00 は WARN、E2E-01～09 は未実施、AbortSignal の発生源は未特定。Node.js 5 テストファイルの再回帰は **21/21 PASS**、関連 5 ファイルの `node --check` は全件成功。arm64 Node.js での `npm run build` と `npm run package` も成功し、`hadome-0.1.22.vsix`（3,942 ファイル、約 10.89 MB）を生成。`unzip -tqq` と VSIX 内の `version=0.1.22`／`autoHandoff.default=false` も確認した。詳細は上記検証報告の第 16 節。実機自動交接は未検証のため、T-019 の保留状態は維持する。

**2026-11-18 試験枠誤接続対策の追記：** 通常ブラウザーから 8799 への `roster` 探索を停止し、`wantTab` のタブ ID 不一致時の代替選択および URL 部分一致を禁止。`content.js`・`bridge.js` に明示的な 8799 ピン確認と、試験枠を介した既存セッション譲渡の抑止を追加した。隔離単体・Chrome API 模擬テスト計 6 件を新設し、Node.js 20.20.2 で対象 7 テストファイル **27/27 PASS**、構文検査と `git diff --check` も通過。稼働中のブラウザーには未反映、実ブラウザー E2E は未実施。T-019 の **WARN／受け入れ保留**を維持。詳細は検証報告第 19 節。

**2026-11-22 持續確認：** 以 Node.js 20.20.2 分組重跑自動交接、Bridge 隔離、串流中斷及部分回應測試，**27/27 PASS**；相關 4 個檔案的 `node --check` 與 `git diff --check` 也成功。Canary CDP 9444 回報 Chrome 159，但 `/json/list` 為空；Canary UI 顯示既有 ChatGPT Bridge Project 工作對話，本輪未操作。正式 8765 仍由正式 VSCodium 監聽，8799／9445 沒有測試服務。E2E-00 所需的專用登入測試分頁及 Bridge 所有權尚未成立，因此不執行 E2E-01～09，T-019 維持暫停。詳見[本輪分析報告](../report/T-019_自動上下文交接E2E_2026-11-22_0444_分析報告.md)。

**2026-11-22 隔離環境續建：** 建立獨立 Canary profile 與 CDP 9445（PID 55668），確認只載入 Chrome「新功能」頁，沒有 Hadome 擴充功能或測試登入。第二個候選 CDP 9446 未持續監聽。另建立隔離 VSCodium user-data／extensions 目錄，載入 repo 開發版 `local.hadome`；其隔離設定為 `chatgptBridge.port=8799` 和 Canary profile 路徑。Extension host 記錄確認擴充已啟動，但 8799 未監聽（Bridge 連線需由面板操作建立）。CUA browser host 無法連線；原生 App 選取 Canary／VSCodium 均只回傳既有視窗，不能操作隔離視窗。Chrome 137 起 branded build 忽略 `--load-extension`，因此命令列載入未生效；本輪沒有改動既有瀏覽器對話或正式 VSCodium。實機 E2E 仍未開始，T-019 維持暫停。詳見[本輪分析報告](../report/T-019_自動上下文交接E2E_2026-11-22_0444_分析報告.md)。

---

## T-025～T-028 Python + todo.md 自動執行器（2026-11-22 登錄）

> 本系列評估以 Python runner 讀寫 `todo/todo.md` 並呼叫既有 Codex CLI，作為輕量自動化方案。沿用目前派工狀態詞彙；不得修改既有工單狀態、既有狀態語意或既有任務列。T-019 實機 E2E 維持獨立保留。

| ID | 狀態 | 類型 | 需求 | 驗收條件與交付 | 相依 | 重試次數 | 暫停原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-025 | 待執行 | 分析 | 評估 Python + todo.md runner 方案 | 盤點 Markdown 表格解析與局部更新、Python 版本相容性、Codex CLI 呼叫與 sandbox／approval、單執行者鎖、逾時／中斷／部分副作用的處理；評估重用或擴充既有 `todo_table.py` 的可行性與跨 repo 影響、狀態欄與本表不同表頭的支援；說明與 T-023 Supervisor、Ralph Loop、人工派工的分工及互斥；比較單一 Markdown 台帳與 gitignored 執行紀錄的取捨；產出只讀評估，不安裝、不實作 | 既有 Supervisor MVP／驗證（PR #25） | 0 | — |
| T-026 | 待執行 | 規格 | 定義追加、啟動、狀態回報、失敗處理及人工復原驗收範圍 | 依 T-025 結論建立最小規格；只沿用 dispatch 已有狀態及暫停原因，不新增狀態標籤；定義狀態比對、明確任務 ID、執行中記錄、單執行鎖、子代理不得寫 todo／commit／push／開 PR、成功由既有人工驗收流程結案；中斷或結果不明使用既有 `⏸️ 暫停`／`等待人工決策`，記錄位置依目標表格實際欄位決定；定義重試與人工復原案例；不修改其他工單列 | T-025 | 0 | — |
| T-027 | 待執行 | 實作 | 建立 Python todo.md 自動執行器最小版本 | 僅依核定規格新增 Python runner；必須明確傳入 `--task T-XXX`，不得自動挑第一列或選取自身／未指定任務；只接受既有可執行狀態及已支援表格格式，未知狀態或欄位 fail-closed；採可偵測的單執行鎖與 gitignored 執行紀錄，僅由 runner 寫入目標列，子代理明確禁止改 todo／commit／push／開 PR；依核定 sandbox 執行 Codex CLI；非零退出、缺少最終輸出、逾時或範圍異常不得標記完成；成功狀態仍由既有人工驗收流程更新 | T-026 | 0 | — |
| T-028 | 待執行 | 驗證 | 驗證 runner 的狀態保護、結果回報與人工復原 | 在暫存目錄的 todo fixture 副本驗證，不得寫正式 todo；fixture 涵蓋本派工表及既有日文表頭、空白／待執行／暫停／完成及帶說明尾碼狀態；驗證追加／明確選取、成功與最終輸出、非零退出、啟動失敗、逾時／中斷後不得重跑、重複啟動鎖、未知欄位／狀態拒絕、局部寫入衝突與人工復原；確認正式 todo 雜湊不變、非目標列位元組不變；記錄實測 Python／Codex CLI 版本與限制，產出 task-report；確認 runner 不會意外進入 VSIX；不以 fake executor 宣稱正式 CLI 通過 | T-027 | 0 | — |

**狀態相容性約束：** 新工單初始狀態使用既有的「待執行」。Runner 必須以明確任務 ID 啟動，不可依派工表順序自動選第一筆。執行中狀態放在 gitignored 執行紀錄，不新增派工狀態；任務遭中斷或結果不明時，使用既有「⏸️ 暫停」及「等待人工決策」，在實際存在的「暫停原因」欄記錄，避免仍以「待執行」狀態被再次挑選。只有經既有驗收程序確認後，才由人工更新既有完成狀態。所有寫入僅限明確指定的目標工單列，不得批次重寫、正規化整張表格或改動其他工單。

## T-029～T-044 T-019 實機 E2E 分段驗收（2026-11-22 拆分）

> T-019 保留為總驗收索引；這 16 張子工單按依賴逐張執行，不將整套 E2E 塞進同一輪上下文。每張只交付該列指定證據；子工單成功不等於 T-019 結案。不得使用正式 8765、既有工作對話或真實工作資料做測試。所有測試均限於隔離 Canary profile、專用 Project／對話及 Bridge 8799。

| ID | 狀態 | 類型 | 需求 | 驗收條件與交付 | 相依 | 重試次數 | 暫停原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-029 | ⏸️ 暫停 | 前置 | 取得隔離 Canary 與 VSCodium 視窗的可控性 | 只核對 CUA/browser host 能否定位隔離視窗，並取得視窗／profile 身分證據；若仍只選到既有視窗，記錄具體錯誤與可恢復入口，不操作既有頁面、不做 E2E；本輪證據見[分析報告](../report/T-029_隔離視窗可控性_2026-11-22_分析報告.md) | — | 0 | CUA `getState()` 回報 `Browsers: Error: The browser access host is unavailable`；Canary App 選取器仍不能定位隔離視窗。CDP 9445／PID 55668 可辨識隔離 Canary（`chrome://whats-new/`），但不足以取得 CUA 視窗控制權；待 browser host 恢復後，以隔離 profile／9445 明確定位視窗再續作 |
| T-030 | 待執行 | 前置 | 在隔離 Canary profile 載入 Hadome 瀏覽器擴充功能 | 透過可見 Chrome UI 載入 repo 的 `chrome-extension/`；核對版本、權限、profile 路徑與擴充啟用狀態。不得使用 `--load-extension`，不得改正式 profile | T-029 | 0 | — |
| T-031 | 待執行 | 前置 | 建立專用 ChatGPT 測試 Project 與對話 | 在隔離 profile 中確認登入狀態，建立專用測試 Project／對話，記錄 URL、Project 與 conversation ID；不記錄或傳遞登入憑證，不使用既有工作對話 | T-030 | 0 | — |
| T-032 | 待執行 | 前置 | 啟動隔離 VSCodium Bridge 8799 | 使用隔離 VSCodium 設定與隔離 profile；只由測試面板建立 Bridge，證明 8799 listener 的 PID／程序來源，且正式 8765 未增加測試連線 | T-029 | 0 | — |
| T-033 | 待執行 | 驗證 | 通過 E2E-00 測試所有權前置檢查 | 以 UI、CDP、extension hello／`pinnedPort` 與 Bridge log 對應 profile、tab target、Project、conversation ID、8799；任何一項對不上即停止，不送交接測試訊息 | T-030、T-031、T-032 | 0 | — |
| T-034 | 待執行 | 驗證 | 執行 E2E-01：停用交接時維持原對話 | 在專用對話停用 auto-handoff，完成規定的多回合交互；核對沒有新對話、conversation ID 不變，保存 UI／URL／Bridge 證據 | T-033 | 0 | — |
| T-035 | 待執行 | 驗證 | 執行 E2E-02：低於 75% 不切換 | 在隔離測試對話確認 context 使用率低於 75%；核對不建立新對話且 ID 不變，保存測量與 UI／Bridge 證據 | T-033 | 0 | — |
| T-036 | 待執行 | 驗證 | 執行 E2E-03：達閾值後建立 fresh 對話 | 將測試條件推至核定閾值；核對觸發 `auto-context-handoff`、`fresh=true`、新舊 conversation ID 不同，且 UI／URL／SSE／Bridge 記錄互相吻合 | T-033 | 0 | — |
| T-037 | 待執行 | 驗證 | 執行 E2E-04：驗證交接內容及後續兩回合 | 在測試資料中交接 TODO、任務脈絡與工具結果；核對新對話收到必要內容，並完成兩回合續作；不得使用真實工作資料 | T-033 | 0 | — |
| T-038 | 待執行 | 驗證 | 執行 E2E-05：驗證新對話的 Project／tab 所有權 | 核對切換後 Project 與 tab target 正確，8799 雙向通訊正常，正式 8765／既有分頁未被搶佔；保存 UI、CDP 與 Bridge log | T-033 | 0 | — |
| T-039 | 待執行 | 驗證 | 執行 E2E-06：阻止重複 `write_file` | 在隔離測試目錄觸發同一寫入情境兩次；核對第二次寫入被抑制、檔案內容／雜湊符合預期，且沒有觸及 repo 正式資料 | T-033 | 0 | — |
| T-040 | 待執行 | 驗證 | 執行 E2E-07：遵守 `maxHandoffs=1` | 設定單次上限並完成一次切換；核對第二次切換遭抑制、conversation ID 不再變更，保存設定與 Bridge 證據 | T-033 | 0 | — |
| T-041 | 待執行 | 驗證 | 執行 E2E-08：背景子代理期間抑制切換 | 只在隔離測試中啟動背景子代理情境；核對背景工作期間不發生自動切換，並保存時間序列與 Bridge log | T-033 | 0 | — |
| T-042 | 待執行 | 驗證 | 執行 E2E-09：導航失敗或 ID 異常時安全停止 | 在隔離對話注入核定的導航失敗／ID 異常；核對系統停止交接、保留錯誤證據，且不重試、不寫入非目標分頁 | T-033 | 0 | — |
| T-043 | 待執行 | 診斷 | 單獨定位 E2E-10 的 AbortSignal 中止來源 | 先以日誌確認 `signal is aborted without reason` 是否重現，再沿事件與呼叫鏈定位來源；交付證據、根因或明確未定原因。若需產品修正，另開工單，不混入本診斷 | T-033 | 0 | — |
| T-044 | 待執行 | 收尾 | 執行 E2E-11：復原隔離環境並核對 Git／連接埠 | 停止本系列自行啟動的隔離程序，復原隔離設定；核對 8765／8799／9445、Git 狀態與非本任務變更，更新總驗收報告。不得關閉或清理所有權不明的程序／資料 | T-034～T-043 | 0 | — |

## T-045～T-060 E2E 可重現驗證與分層驗收（2026-11-23）

> 使用者已採用分層驗證方案。本系列依[完整規格](./spec/e2e-testability.md)執行，每張只處理一項能力並產出 task-report。T-045～T-058 不依賴 T-029 或 CUA；T-059 由 Brian 人工驗收真實 Canary／VSCodium／ChatGPT。舊工單狀態保留，透過 T-060 的逐項證據對照處理驗收範圍變更，不能以 fixture 通過宣稱實機 PASS。所有新工單目前均尚未執行。

| ID | 狀態 | 類型 | 需求 | 驗收條件與交付 | 相依 | 重試次數 | 暫停原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-045 | ✅ 完成 | 分析 | 盤點既有覆蓋與固定測試契約 | 對照 E2E-00～11 與現有 Node tests，列出已覆蓋／缺口／必要真實元件；盤點 Chromium、Node、Playwright、editor 版本與可重用入口，提出逐項工作量及未確認事項；交付覆蓋矩陣與可執行契約，不重寫測試框架 | — | 0 | — |
| T-046 | ✅ 完成 | 實作 | 建立隔離執行紀錄與每案例清理 | 建立 runId、暫存根目錄、profile／workspace／ports／PID owner manifest、逾時與 finally 清理；驗證成功／assertion 失敗／取消能釋放自有程序，強制終止留下復原紀錄；不碰正式 8765 或既有 profile | T-045 | 0 | — |
| T-047 | 待執行 | 實證 | 自動載入原始 MV3 擴充並完成 Bridge 握手 | 使用版本固定的相容 Chromium persistent context、原始 manifest 與隔離 Bridge；證明 service worker、content script hello、welcome、protocol、pinnedPort 與 tab/profile 對應，錯 pin 拒絕；無 CUA／登入；交付最小可重跑實證，失敗即暫停瀏覽器後續 | T-046 | 0 | — |
| T-048 | 待執行 | 實作 | 建立受控 ChatGPT 頁面與 SSE fixture | 實作最小 composer／Project／conversation 路徑與合成 HTTP/SSE 契約；驗證 MAIN world fetch 攔截與未匹配外網 fail-closed，真實 auth／conversation 外送為零；保留正式擴充權限，交付 fixture 說明與網路稽核 | T-047 | 0 | — |
| T-049 | 待執行 | 驗證 | 驗證真實擴充與 Bridge 正常串流鏈路 | prompt 經 Bridge 到 DOM，再由 fixture fetch 經 injected/content 回傳；assert partial、complete、文字、conversation ID；不得直接呼叫完成 callback；保存 log／trace、assertion、exit code 與清理證據 | T-048 | 0 | — |
| T-050 | 待執行 | 驗證 | 驗證串流中斷與 AbortSignal 安全停止 | SSE 中斷、明確 abort、WebSocket 斷線分開重現；assert partial 不當成功、不自動重送或執行殘缺工具；交付各來源事件鏈，清楚區分合成重現與 T-043 歷史線上根因，後者未定不得結案 | T-049 | 0 | — |
| T-051 | 待執行 | 驗證 | 驗證估算閾值、新對話與兩回合續作 | 經真實擴充／Bridge／Agent 驗證停用、低於／等於／高於 75% 估算邊界；啟用觸發 fresh=true、新舊 ID 不同、同 Project、交接內容與兩回合續作；縮小隔離 contextWindow，記錄輸入與估算公式 | T-049 | 0 | — |
| T-052 | 待執行 | 驗證 | 驗證副作用、交接上限與背景抑制 | 獨立案例驗證交接後重複 write_file 被阻止且暫存檔雜湊符合預期、maxHandoffs=1 阻止第二次切換、背景 pending 抑制及結束後重新評估；重用現有測試，補真實傳輸覆蓋，交付三類證據 | T-051 | 0 | — |
| T-053 | 待執行 | 驗證 | 驗證導航與對話所有權異常 | 導航失敗、相同 ID、缺失 ID、錯 Project、錯 tab 分別注入；assert 安全停止且不向非目標 tab 送 prompt 或執行工具；每例獨立 profile 與清理，交付錯誤及負向證據 | T-051 | 0 | — |
| T-054 | 待執行 | 驗證 | 驗證多組隔離環境不互搶 | 兩組獨立 context／Bridge，驗證顯式 pin、roster 邊界與所有權；停止一組另一組正常，不連正式 8765；動態埠須與測試埠具有同等隔離；交付程序／profile／tab／port 對照 | T-049 | 0 | — |
| T-055 | 待執行 | 實證 | 建立 Extension Development Host 測試啟動入口 | 以專用 user-data／extensions／workspace 及 extensionTestsPath 啟動原始擴充，取得 activation 證據並自動退出；分別記錄 VS Code／VSCodium 相容性；VSCodium 未通過時保留線上人工驗收要求 | T-046 | 0 | — |
| T-056 | 待執行 | 驗證 | 驗證編輯器設定與 Bridge 生命週期接線 | 從正式命令／面板可測入口建立隔離 Bridge，核對設定讀取、8799 listener owner、重複啟動與 dispose 釋放；必要時最小抽取共用內部入口，不加 production bypass；保存設定前後差異與程序證據 | T-055、T-047 | 0 | — |
| T-057 | 待執行 | 實作 | 統一測試命令、單例重跑與機器可讀報告 | 提供 Node、browser integration、editor integration 分開命令與 case 選取；輸出 runId／commit／版本／預期實際／exit code／artifact 路徑；未執行不可 PASS，保護日誌並排除 VSIX；交付操作說明 | T-050、T-052、T-053、T-054、T-056 | 0 | — |
| T-058 | 待執行 | 驗證 | 驗證可重跑性、失敗清理與強制終止復原 | 至少兩次全新 profile 全套重跑及指定 case 單跑；驗證失敗／timeout／取消清理、一次強制終止後依 owner manifest 安全復原；核對外網零外送、正式工作區／設定未變與殘存程序，交付完整 fresh evidence | T-057 | 0 | — |
| T-059 | 待執行 | 人工驗收 | 完成隔離 Canary／VSCodium 線上相容性驗收 | 提供可直接照做的步驟與遮蔽證據模板，由 Brian 在專用登入 profile 安裝／確認擴充並啟動 Bridge；核對所有權、停用交接多回合、啟用後切新 ID、同 Project/tab、交接內容及兩回合續作；每例復原設定與程序，不等待 CUA；未取得人工結果維持未完成 | T-058 | 0 | — |
| T-060 | 待執行 | 收尾 | 更新舊 E2E 覆蓋矩陣與 T-019 驗收結論 | 逐項對照 T-029～T-044／E2E-00～11，標示離線／受控整合／實機人工證據與範圍變更；保留未定 AbortSignal 根因，不偽標舊實機 PASS；取得 Brian 驗收、清理核對及缺口處置後才判定 T-019 可否結案，交付總報告與接手入口 | T-059 | 0 | — |

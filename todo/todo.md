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

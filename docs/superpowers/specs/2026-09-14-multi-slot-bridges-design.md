# 多席位（multi-slot）：讓多個編輯器視窗各自對談

日期：2026-09-14

## 背景

hadome 目前一次只能跑一組「一個編輯器視窗 ＋ 一個 ChatGPT 分頁」。想同時開兩三個專案時，第二個視窗開不起橋（埠被佔），或是把第一個視窗的分頁搶走。

原因不是架構做不到，而是兩邊的埠範圍都被壓成單一個：

- [src/portlock.js](../../../src/portlock.js) `PORT_FROM = 8765`、`PORT_TO = PORT_FROM`，害 [src/bridge.js](../../../src/bridge.js) 裡「換下一個埠」的漫遊邏輯變成死碼。
- [chrome-extension/content.js](../../../chrome-extension/content.js) 同樣是 `8765~8765`，分頁只會掃一個埠。

而「多橋多分頁並行」的機制其實已經在跑：子代理走 [src/pool.js](../../../src/pool.js)（base `8810`、`subAgents` 預設 2），每個 slot 各自開一座橋、各自開一個用 `?bridge_port=` 釘住的分頁。所以這次要做的是**把已驗證的並行機制開放給主面板**，並用「明確配對」取代現有的「互搶交接」。

## 目標 / 非目標

**目標**

- 同時最多 8 個編輯器視窗，各自對談，彼此不搶分頁。
- 配對是明確的：跑一個指令就開出專屬分頁，看得出誰對誰。
- 每個視窗的子代理埠不互撞。
- 單視窗使用者的既有體驗零變化。

**非目標**

- 不支援多個 ChatGPT 帳號或多個瀏覽器 profile。
- 不做跨視窗的對話共享或排程協調。
- 不改 `subAgents` 預設值（維持 2）。
- 不處理 ChatGPT 帳號本身的並行限流，只在文件提醒。

## 設計：一個視窗 = 一個「席位」

一個席位 = 一個主橋埠 ＋ 一個釘住該埠的 ChatGPT 分頁 ＋ 一段專屬的子代理埠區塊。

| 用途 | 埠 |
|---|---|
| 主橋 | `8765`–`8775`，跳過保留埠 `8767/8768/8769` → 共 8 席 |
| 子代理 | 每席一塊 8 埠：`8810 + slotIndex * 8` → `8810`–`8873` |

保留埠 `8767`–`8769` 在程式碼中已無其他消費者，但瀏覽器擴充的 `SKIP` 也列著同一組，兩邊必須一致，因此沿用不動。

## 決策

### 決策一：明確配對，而非自動搶空位

放開埠範圍後，未釘住的分頁會掃過 8 個埠，落在哪一座橋不可預測。所以新增 `chatgptBridge.pairTab` 指令：開橋拿到埠 → `vscode.env.openExternal` 開出 `https://chatgpt.com/?bridge_port=<埠>` → content.js 的 `pinnedPort()` 把它寫進 `sessionStorage`，之後只連那一埠。

`vscode.env.openExternal` 是唯一能在「還沒有任何分頁連上」時開分頁的途徑；`bridge.openTabFor()` 走的是既有 WebSocket 連線，只適合子代理。

未跑過配對指令的分頁仍會亂掃——這是保留舊行為的代價，配對指令是建議路徑，不是強制。

### 決策二：配對模式關掉 claim/handover

`claim.json` 是 `~/.chatgpt-bridge/ports/` 下的**全域單一檔**。沒有分頁的視窗會寫 claim，任何持有分頁且不在回答中的視窗就把分頁讓出去。單視窗時這是貼心的接力，多視窗時就是互搶。

釘住的分頁本身會無視 `handover`，但橋側在送出 handover 後已經把 `sock` / `targetId` 清掉，造成無謂斷線與一次重連。因此配對模式下 `pollClaim()` 與 `writeClaim()` 都跳過。

非配對模式維持原樣，單視窗使用者感覺不到差別。

### 決策三：子代理埠依席位切塊

`makePool({ base: settings().subPortBase })` 是寫死的全域設定，兩個視窗都會搶 `8810`，而 `pool.freePort()` 只看自己行程內的 `inUse`，跨行程撞了只會拿到 EADDRINUSE（子橋 `roam` 為 false，直接 reject）。

改成依主橋埠算出專屬 base：`subBaseFor(mainPort, subPortBase) = subPortBase + slotIndexOf(mainPort) * 8`。每席 8 埠遠大於 `subAgents` 的合理上限，留足餘裕。

## 影響

| 檔案 | 影響 |
|---|---|
| `src/portlock.js` | `PORT_TO` 改 `8775`；新增 `mainPorts()` / `slotIndexOf()` / `subBaseFor()` |
| `src/bridge.js` | `openBridge()` 新增 `paired` 參數；`pollClaim` / `writeClaim` 在配對模式跳過；`liveOthers()` 過濾子橋鎖；新增 `pairUrl()` |
| `extension.js` | `ensureBridge()` 拆出「不等分頁」路徑；新增 `pairTab()`；子代理 pool base 改用 `subBaseFor()` |
| `package.json` / `package.nls*.json` | 新增 `chatgptBridge.pairTab` 指令與三語標題 |
| `src/i18n/*.js` | 連線提示帶埠號；新增配對相關字串 |
| `chrome-extension/content.js` | `PORT_TO` 改 `8775` |
| `test/` | 新增 `portlock.test.js`；`bridge-lifecycle.test.js` 加漫遊與配對案例 |
| `README*.md` | 新增「多視窗」章節 |

**相容性**：舊版瀏覽器擴充只掃 `8765`，配對到 `8766` 以上的視窗會連不上。兩邊擴充必須同版更新；訊息格式沒變，`TAB_PROTOCOL` 維持 59。

## 已知取捨

- **帳號限流**：8 席 × 每席 2 個子代理 = 最多 24 個同時分頁，實務上 ChatGPT 帳號會先被限流。文件建議同時 2–3 席。
- **未釘住的分頁仍會亂掃**：落點不可預測，只能靠配對指令避免。

## Why

hadome 一次只能跑一組「一個編輯器視窗 ＋ 一個 ChatGPT 分頁」。想同時開兩三個專案時，第二個視窗開不起橋（埠被佔），或是把第一個視窗的分頁搶走。

根因有三：

1. `src/portlock.js` 的 `PORT_TO = PORT_FROM`，把主橋埠範圍壓成單一個 `8765`，害 `src/bridge.js` 裡「換下一個埠」的漫遊邏輯變成死碼。
2. `chrome-extension/content.js` 的 `PORT_TO = 8765` 同樣被壓死，分頁只會掃一個埠。
3. `claim.json` 是全域單一檔，沒有分頁的視窗一寫 claim，持有分頁的視窗就把分頁讓出去——單視窗時是接力，多視窗時是互搶。

而「多橋多分頁並行」的機制其實已經在跑：子代理走 `src/pool.js`（base `8810`、`subAgents` 預設 2），每個 slot 各自開一座橋、各自開一個用 `?bridge_port=` 釘住的分頁。並行是可行的，只是沒開放給主面板。

## What Changes

引入「席位」概念：一個席位 = 一個主橋埠 ＋ 一個釘住該埠的 ChatGPT 分頁 ＋ 一段專屬的子代理埠區塊。主橋埠範圍放開為 `8765`–`8775`（跳過保留埠 `8767`/`8768`/`8769`），共 8 席。

- 新增 `chatgptBridge.pairTab` 指令：開橋拿到埠後用 `vscode.env.openExternal` 開出 `https://chatgpt.com/?bridge_port=<埠>`，分頁自己釘住該埠。
- 配對模式下不參與 claim/handover，視窗之間不搶分頁。非配對模式維持既有的接力行為。
- 子代理埠依席位切塊：`8810 + slotIndex * 8`，兩個視窗的子代理不再互撞。
- 連線提示帶上埠號，看得出自己是哪一席。

**刻意的行為擴張**：第二個視窗用預設設定開機時，會自動漫遊到 `8766`（原本是直接報「埠被佔用」）。

**不做**：不支援多個 ChatGPT 帳號或瀏覽器 profile；不做跨視窗的對話共享或排程協調；不改 `subAgents` 預設值；不強制配對（未釘住的分頁仍可掃描連線）。

## Capabilities

### New Capabilities

- `bridge-slots`: 編輯器視窗與 ChatGPT 分頁的席位分配——主橋埠如何取得、視窗與分頁如何配對、子代理埠如何切塊、視窗之間何時可以移交分頁。

### Modified Capabilities

（無。`command-permission` 不受影響。）

## Impact

| 檔案 | 影響 |
|---|---|
| `src/portlock.js` | `PORT_TO` 改 `8775`；新增並匯出 `mainPorts()` / `slotIndexOf()` / `subBaseFor()` 與 `SUB_BLOCK` |
| `src/bridge.js` | `openBridge()` 新增 `paired` 參數；`pollClaim()` 與 `waitForTab()` 的 `writeClaim` 在配對模式跳過；`liveOthers()` 過濾非主橋鎖；api 新增 `pairUrl()` |
| `extension.js` | `ensureBridge()` 拆出「不等分頁」路徑；新增 `pairTab()` 指令處理；`makeSpawner()` 的 pool base 改用 `subBaseFor()`；配對旗標存 `workspaceState` |
| `package.json`、`package.nls*.json` | 新增 `chatgptBridge.pairTab` 指令與三語標題 |
| `src/i18n/zh-tw.js`、`ja.js`、`en.js` | `note.waitingTab` / `note.tabConnected` 加 `{port}`；新增 `pair.*` 字串 |
| `chrome-extension/content.js` | `PORT_TO` 改 `8775` |
| `test/portlock.test.js`（新） | `mainPorts()` / `slotIndexOf()` / `subBaseFor()` 單元測試 |
| `test/bridge-lifecycle.test.js` | EADDRINUSE 漫遊案例；配對模式不送 handover 的案例 |
| `README.md`、`README.ja.md`、`README.zh-TW.md` | 新增「多視窗」章節 |

**不受影響**：`webview/panel.html`、`chrome-extension/background.js`（`?bridge_port=` 的處理已經通用）、`chrome-extension/manifest.json`、`src/pool.js`（`base` 本來就是參數）、`TAB_PROTOCOL`（訊息格式沒變，維持 59）。

**相容性**：舊版瀏覽器擴充只掃 `8765`，配對到 `8766` 以上的視窗會連不上。編輯器擴充與瀏覽器擴充必須同版更新。

**安全面**：本變更不動任何權限閘門。新開的埠一律綁 `127.0.0.1`，與既有主橋相同；`RESERVED` 保留埠維持跳過，兩邊清單一致。

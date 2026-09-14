## Context

hadome 的主橋在 `openBridge()` 裡開一個 WebSocket server，綁 `127.0.0.1:<port>`，`port` 來自 `chatgptBridge.port`（預設 `8765`）。瀏覽器擴充的 content script 從 `PORT_FROM` 掃到 `PORT_TO`，連上後送 `hello`，橋回 `welcome` 就成為目標分頁。

兩邊的範圍都被壓成單一個埠：

```js
// src/portlock.js
const PORT_FROM = 8765;
const PORT_TO = PORT_FROM;

// chrome-extension/content.js
const PORT_FROM = 8765;
const PORT_TO = 8765;
```

`src/bridge.js` 收到 `EADDRINUSE` 時本來會往上找空埠，但 `roam && openedPort < portlock.PORT_TO` 永遠為 false，直接報「埠被佔用」。

另一條線是 claim/handover：`~/.chatgpt-bridge/ports/claim.json` 是全域單一檔，`waitForTab()` 等超過 5 秒就寫 claim，其他橋每秒輪詢，看到 claim 就把分頁讓出去。

詳細背景見 [docs/superpowers/specs/2026-09-14-multi-slot-bridges-design.md](../../../docs/superpowers/specs/2026-09-14-multi-slot-bridges-design.md)。

## Goals / Non-Goals

**Goals:**

- 同時最多 8 個編輯器視窗，各自對談，彼此不搶分頁。
- 配對是明確的：跑一個指令就開出專屬分頁。
- 每個視窗的子代理埠不互撞。
- 單視窗使用者的既有體驗零變化。

**Non-Goals:**

- 不支援多個 ChatGPT 帳號或瀏覽器 profile。
- 不做跨視窗的對話共享或排程協調。
- 不改 `subAgents` 預設值。
- 不強制配對——未釘住的分頁仍可掃描連線。
- 不處理 ChatGPT 帳號本身的並行限流，只在文件提醒。

## Decisions

### 決策一：埠位切塊，而非動態協商

主橋 `8765`–`8775` 跳過 `RESERVED` 後得 8 席；子代理每席一塊 8 埠，base 為 `8810 + slotIndex * 8`。

替代方案是讓行程之間協商埠位（例如共用一個註冊檔加鎖）。不採用：現有的 `writeLock()` / `listLocks()` 已經夠用，而純函式算出的固定切塊沒有競態、好測、出事時人也看得懂哪個埠屬於誰。

每席 8 埠遠大於 `subAgents` 的合理上限，留足餘裕。

### 決策二：明確配對，而非自動搶空位

放開埠範圍後，未釘住的分頁會掃過 8 個埠，落在哪一座橋不可預測。`chatgptBridge.pairTab` 指令用 `vscode.env.openExternal()` 開出帶 `?bridge_port=` 的網址，content script 的 `pinnedPort()` 會把它寫進 `sessionStorage`，之後只連那一埠。

用 `openExternal` 而非 `bridge.openTabFor()`：後者靠既有 WebSocket 連線叫瀏覽器擴充開分頁，在「還沒有任何分頁連上」時無從施力，只適合子代理。

### 決策三：配對模式關掉 claim/handover

`claim.json` 是全域單一檔。多視窗時，沒有分頁的視窗一寫 claim，持有分頁的視窗就把分頁讓出去。

釘住的分頁本身會無視 `handover` 訊息，但橋側在送出 handover 後已經把 `sock` / `targetId` 清掉，造成無謂斷線與一次重連。因此配對模式下 `pollClaim()` 直接 return、`waitForTab()` 不寫 claim。

替代方案是把 claim 改成 per-port 檔並加上收件人。不採用：配對模式下 claim 本來就沒有用途（每個視窗都有自己的分頁），為它設計定址協定是多餘的抽象。

**配對旗標的判定**：`paired = workspaceState 的 pairedFlag || settings().port !== portlock.PORT_FROM`。跑過 `pairTab` 會設旗標；使用者手動把 `chatgptBridge.port` 設成非預設值，意圖同樣明確。

### 決策四：`liveOthers()` 過濾非主橋鎖

子橋也走 `openBridge()`，因此也會 `writeLock()`。埠範圍放開後，`liveOthers()` 會把 `8810` 之類的子代理埠誤報成「別的視窗握著分頁」，讓 `noTabWhy()` 的指引指向不存在的視窗。加上 `slotIndexOf(l.port) >= 0` 過濾。

## Risks / Trade-offs

- **帳號限流**：8 席 × 每席 2 個子代理 = 最多 24 個同時分頁，ChatGPT 帳號會先被限流。緩解：預設值不動，文件建議同時 2–3 席。
- **舊版瀏覽器擴充**：只掃 `8765`，配對到 `8766` 以上的視窗會連不上，且失敗是無聲的（分頁一直掃不到）。緩解：README 三語寫明兩邊必須同版更新；`br.portBusy` 的指引補上配對指令。
- **未釘住的分頁仍會亂掃**：落點不可預測。這是保留舊行為的代價，接受。
- **席位上限寫死 8**：不做成設定項。真要更多席位，改 `PORT_TO` 一個常數即可，但兩邊擴充要同步改——維持 YAGNI。

## Migration Plan

無資料遷移。`~/.chatgpt-bridge/ports/` 下的舊 `claim.json` 與 `*.json` 鎖檔格式不變，`readLock()` 本來就會清掉死行程的殘留。

使用者側：更新編輯器擴充與瀏覽器擴充後，單視窗行為不變；要用多視窗才需要跑 `pairTab`。

## Open Questions

無。

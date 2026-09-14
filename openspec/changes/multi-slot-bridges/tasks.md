## 1. 埠位分配（`src/portlock.js`）

- [x] 1.1 `PORT_TO` 從 `PORT_FROM` 改為 `8775`
- [x] 1.2 新增 `SUB_BLOCK = 8` 常數
- [x] 1.3 新增 `mainPorts()`：`PORT_FROM..PORT_TO` 扣掉 `RESERVED`
- [x] 1.4 新增 `slotIndexOf(port)`：在 `mainPorts()` 中的序號，找不到回 `-1`
- [x] 1.5 新增 `subBaseFor(port, subPortBase)`：`subPortBase + slotIndexOf(port) * SUB_BLOCK`，`-1` 時退回 `subPortBase`
- [x] 1.6 於 `module.exports` 匯出 `SUB_BLOCK`、`mainPorts`、`slotIndexOf`、`subBaseFor`

## 2. 埠位分配單元測試（`test/portlock.test.js`，新檔）

- [x] 2.1 `mainPorts()` 等於 `[8765,8766,8770,8771,8772,8773,8774,8775]`，長度 8
- [x] 2.2 `slotIndexOf(8765) === 0`、`slotIndexOf(8770) === 2`、`slotIndexOf(8768) === -1`
- [x] 2.3 `subBaseFor` 對 8 席產出的區塊兩兩不重疊，且全落在 `8810`–`8873`
- [x] 2.4 子代理區塊與主橋範圍 `8765`–`8775` 無交集
- [x] 2.5 `subBaseFor(9000, 8810) === 8810`

## 3. 配對模式（`src/bridge.js`）

- [x] 3.1 `openBridge()` 參數新增 `paired = false`
- [x] 3.2 `pollClaim()` 開頭在 `paired` 為真時直接 return
- [x] 3.3 `waitForTab()` 的 `askTimer` 在 `paired` 為真時不呼叫 `portlock.writeClaim`
- [x] 3.4 `liveOthers()` 加上 `portlock.slotIndexOf(l.port) >= 0` 過濾，排除子橋鎖
- [x] 3.5 api 新增 `pairUrl()` → `'https://chatgpt.com/?bridge_port=' + openedPort`
- [x] 3.6 確認 `roam` 條件（`port === portlock.PORT_FROM`）與漫遊迴圈在 `PORT_TO` 放開後正確跳過保留埠

## 4. 橋的生命週期測試（`test/bridge-lifecycle.test.js`）

- [x] 4.1 新增案例：第一座 server emit `EADDRINUSE`，斷言重開的 server 拿到的 port 為 `8766`
- [x] 4.2 新增案例：`8765`/`8766` 都 `EADDRINUSE` 時，第三座開在 `8770`
- [x] 4.3 新增案例：`paired: true` 時，即使 claim 檔存在也不送 `handover`（用 `CHATGPT_BRIDGE_PORTS_DIR` 指向臨時目錄）
- [x] 4.4 新增案例：`pairUrl()` 回傳的網址帶正確埠號
- [x] 4.5 執行 `npm test` 確認全數通過

## 5. 配對指令（`extension.js` + `package.json`）

- [x] 5.1 `ensureBridge(s, port)` 增加選項讓呼叫端可跳過 `await s.bridge.waitForTab()`，既有呼叫端行為不變
- [x] 5.2 新增 `pairedFor()`：讀 `workspaceState` 旗標，或 `settings().port !== portlock.PORT_FROM`
- [x] 5.3 `openBridge()` 呼叫處帶入 `paired: pairedFor()`
- [x] 5.4 新增 `pairTab()`：確保橋已開（不等分頁）→ 寫入 `workspaceState` 配對旗標 → `vscode.env.openExternal(vscode.Uri.parse(s.bridge.pairUrl()))` → 面板提示埠號
- [x] 5.5 `activate()` 註冊 `chatgptBridge.pairTab`
- [x] 5.6 `package.json` `contributes.commands` 新增該指令（格式照 `chatgptBridge.disconnectTab`）
- [x] 5.7 `package.nls.json`、`package.nls.ja.json`、`package.nls.zh-tw.json` 補上指令標題

## 6. 子代理埠切塊（`extension.js`）

- [x] 6.1 `makeSpawner()` 的 `makePool({ base })` 改用 `portlock.subBaseFor(s.bridge ? s.bridge.port : settings().port, settings().subPortBase)`
- [x] 6.2 確認 `makeSpawner(s, opts)` 的呼叫時機在 `s.bridge` 建立之後；若不是，改在 `openTab`/`openBridge` 回呼時才解析 base
- [ ] 6.3 ~~日誌補上子代理 base~~ — 不做。每次 `handleRun` 都會叫一次 `makeSpawner`，印一行固定值只是雜訊；既有的 `[sub:{port}]` 日誌已經看得出區塊

## 7. 三語 i18n（`src/i18n/*.js`）

- [x] 7.1 `note.waitingTab`、`note.tabConnected`、`note.tabResumed` 加 `{port}` 變數
- [x] 7.2 新增 `pair.opened`（已開出配對分頁，附埠號）、`pair.failed`（開不出瀏覽器）
- [x] 7.3 `br.portBusy` 的指引補一句「跑一次配對指令」
- [x] 7.4 `br.oldTab` / `br.oldTabHow` 補上「編輯器擴充與瀏覽器擴充必須同版更新」
- [x] 7.5 三本書（`zh-tw.js`、`ja.js`、`en.js`）都要補齊

## 8. 瀏覽器擴充（`chrome-extension/content.js`）

- [x] 8.1 `PORT_TO` 改 `8775`
- [x] 8.2 確認 `SKIP` 仍為 `[8767, 8768, 8769]`，與 `portlock.RESERVED` 一致
- [x] 8.3 確認 `PORT_COUNT` / `searched` / `restMs()` 的節流在 8 埠下仍合理（掃完一輪才退避）
- [x] 8.4 確認 `handover` 對釘住分頁免疫的邏輯未被影響

## 9. 文件

- [x] 9.1 `README.md` 在 Install 之後新增「多視窗」章節：配對指令、席位上限 8、帳號限流提醒
- [x] 9.2 `README.ja.md` 同上
- [x] 9.3 `README.zh-TW.md` 同上
- [x] 9.4 三份 README 都寫明兩邊擴充必須同版更新

## 10. 端對端驗收（**未執行**——需要真的裝上兩份擴充、開兩個視窗、登入 ChatGPT，只能由人工在本機跑）

- [ ] 10.1 兩個編輯器視窗分別開專案 A、B，各跑一次配對指令
- [ ] 10.2 確認面板各自顯示不同埠（A=8765、B=8766），瀏覽器多出兩個釘住的分頁
- [ ] 10.3 兩邊同時送訊息，確認回覆沒有串台
- [ ] 10.4 兩邊同時觸發子代理，確認子分頁的 `bridge_port` 落在不同區塊（8810-、8818-），沒有 EADDRINUSE
- [ ] 10.5 關掉 A 的視窗，確認 B 的分頁沒有被搶走、對話不中斷
- [ ] 10.6 單視窗情境回歸：只開一個視窗、不跑配對指令，確認行為與改版前一致
- [ ] 10.7 用舊版瀏覽器擴充跑一次，確認連不上時給的是「請更新瀏覽器擴充」而不是無聲失敗

# bridge-slots Specification

## Purpose

定義編輯器視窗與 ChatGPT 分頁的席位分配：主橋埠怎麼取得、視窗與分頁怎麼配對、子代理埠怎麼切塊、視窗之間什麼時候可以移交分頁。

一個席位 = 一個主橋埠 ＋ 一個釘住該埠的 ChatGPT 分頁 ＋ 一段專屬的子代理埠區塊。

## Requirements
### Requirement: 主橋席位的埠位範圍

系統 SHALL 在 `8765`–`8775` 的範圍內分配主橋埠，並 MUST 跳過保留埠 `8767`、`8768`、`8769`，得到 8 個席位。

`slotIndexOf(port)` SHALL 回傳該埠在席位清單中的序號（`8765` 為 0），對不在清單內的埠 MUST 回傳 `-1`。

瀏覽器擴充的掃描範圍與跳過清單 MUST 與編輯器端一致，否則分頁掃不到新席位。

#### Scenario: 席位清單跳過保留埠

- **WHEN** 呼叫 `mainPorts()`
- **THEN** 回傳 `[8765, 8766, 8770, 8771, 8772, 8773, 8774, 8775]`，長度為 8

#### Scenario: 保留埠不是席位

- **WHEN** 呼叫 `slotIndexOf(8768)`
- **THEN** 回傳 `-1`

### Requirement: 埠被佔用時自動漫遊

當視窗使用預設埠 `8765` 開橋而該埠已被佔用時，系統 SHALL 依序往上尋找席位清單中的下一個空埠並在該埠開橋，並在紀錄中寫明實際開在哪一埠。

席位全滿時 SHALL 回報「沒有空席」而非靜默失敗。

使用者明確指定非預設埠時 MUST NOT 漫遊——指定即是意圖，撞埠要讓使用者知道。

#### Scenario: 第二個視窗自動落到下一席

- **WHEN** `8765` 已被佔用，第二個視窗以預設設定開橋
- **THEN** 橋開在 `8766`，且 `bridge.port` 為 `8766`

#### Scenario: 漫遊時跳過保留埠

- **WHEN** `8765` 與 `8766` 都被佔用，第三個視窗以預設設定開橋
- **THEN** 橋開在 `8770`（跳過 `8767`–`8769`）

#### Scenario: 指定埠不漫遊

- **WHEN** 使用者把 `chatgptBridge.port` 設為 `8770` 且該埠已被佔用
- **THEN** 系統回報埠被佔用，MUST NOT 改開在其他埠

### Requirement: 視窗與分頁的明確配對

系統 SHALL 提供 `chatgptBridge.pairTab` 指令，讓使用者把當前視窗配對到一個專屬的 ChatGPT 分頁。

指令 SHALL 先確保橋已開起（此時 MUST NOT 阻塞等待分頁連上），取得實際埠號後，以外部瀏覽器開啟 `https://chatgpt.com/?bridge_port=<埠>`。分頁 SHALL 把該埠釘在 `sessionStorage`，之後只連該埠、不再掃描其他埠。

指令 SHALL 在面板告知本視窗的埠號，讓使用者看得出自己是哪一席。

#### Scenario: 配對開出釘住的分頁

- **WHEN** 使用者在橋開於 `8766` 的視窗執行 `chatgptBridge.pairTab`
- **THEN** 瀏覽器開出 `https://chatgpt.com/?bridge_port=8766`，該分頁只連 `8766`

#### Scenario: 尚未有分頁時也能配對

- **WHEN** 視窗剛啟動、還沒有任何 ChatGPT 分頁連上，使用者執行 `chatgptBridge.pairTab`
- **THEN** 系統先開橋取得埠號，再開分頁，MUST NOT 因為等不到分頁而逾時失敗

#### Scenario: 釘住的分頁不理會移交要求

- **WHEN** 已釘住 `8766` 的分頁收到 `handover` 訊息
- **THEN** 分頁留在 `8766`，不移往其他埠

### Requirement: 配對模式不參與分頁移交

視窗處於配對模式時，系統 MUST NOT 寫入 claim，也 MUST NOT 回應其他視窗的 claim 而讓出分頁。

視窗 SHALL 在下列任一條件成立時視為配對模式：

- 使用者在本工作區執行過 `chatgptBridge.pairTab`
- `chatgptBridge.port` 被設為非預設值

非配對模式 SHALL 維持既有的移交行為，讓單視窗使用者的體驗不變。

#### Scenario: 配對視窗不搶別人的分頁

- **WHEN** 配對視窗 A 等不到分頁
- **THEN** A MUST NOT 寫入 claim，其他視窗的分頁不受影響

#### Scenario: 配對視窗不讓出分頁

- **WHEN** 配對視窗 B 持有分頁，且 claim 檔中有其他埠的要求
- **THEN** B MUST NOT 送出 `handover`，`sock` 與目標分頁維持不變

#### Scenario: 非配對視窗維持接力行為

- **WHEN** 兩個視窗都用預設埠、都沒配對，其中一個等不到分頁
- **THEN** 既有的 claim/handover 接力照常運作

### Requirement: 子代理埠依席位切塊

每個席位 SHALL 擁有一段專屬的子代理埠區塊，`subBaseFor(mainPort, subPortBase)` 回傳 `subPortBase + slotIndexOf(mainPort) * 8`。主橋埠不在席位清單內時 SHALL 退回 `subPortBase`。

子代理連線池 SHALL 使用該視窗的專屬 base，使不同視窗的子代理不會爭搶同一埠。

#### Scenario: 兩個視窗的子代理區塊不重疊

- **WHEN** 視窗 A 的橋在 `8765`、視窗 B 的橋在 `8766`，`subPortBase` 為 `8810`
- **THEN** A 的子代理 base 為 `8810`、B 為 `8818`，兩段區塊不重疊

#### Scenario: 席位外的埠退回預設 base

- **WHEN** 主橋埠為 `9000`（不在席位清單內），`subPortBase` 為 `8810`
- **THEN** 子代理 base 為 `8810`

#### Scenario: 子代理區塊不與主橋範圍重疊

- **WHEN** 列舉 8 個席位的子代理區塊
- **THEN** 所有區塊落在 `8810`–`8873`，與主橋範圍 `8765`–`8775` 無交集

### Requirement: 分頁持有狀態只計主橋

系統在回報「分頁被別的視窗握著」時，SHALL 只考慮席位清單內的埠。子代理的橋也會寫入埠鎖，但 MUST NOT 被當成別的編輯器視窗。

#### Scenario: 子代理埠不被誤報為別的視窗

- **WHEN** 本視窗等不到分頁，而埠鎖中存在 `8810` 的子代理紀錄
- **THEN** 錯誤訊息 MUST NOT 指向 `8810`


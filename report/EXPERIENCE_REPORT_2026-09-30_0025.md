---
type: experience-report
generated_at: 2026-09-30_0025
covers_period: 2026-09-29 22:00 ~ 2026-09-30 00:25
subject: neverPlus（略過權限確認 Plus）顯示與行為修正
source_reports: 0
pitfall_count: 12
---

# 經驗報告：neverPlus 顯示與行為修正

## 1. 先看這個

1. **面板顯示的模式不等於實際生效的模式。** 面板切換模式時寫入 Global，但專案的 `.vscode/settings.json` 只要有 `chatgptBridge.mode`，就會蓋過 Global。面板照樣顯示加強版，實際跑的卻是 `edit`，所以許可清單外的指令還是會詢問。這個 bug 在程式碼裡看不出來，要把設定檔也一起查才找得到。
2. **上游合併會把功能拆成「半活」狀態。** 0.1.21 合併保留了 `modeCycle.js`、`tools.js`、`panel.html` 裡的 neverPlus，卻丟掉了 i18n、`extension.js` 和 `package.json` 的部分。選單上出現原始 key（`mode.neverPlus`）就是這種狀態的訊號。
3. **使用者對外觀的描述有歧義時，先看截圖再動手。** 「觸發顏色從藍色改暗紅」我先猜成焦點外框，但實際是滑過時的藍色底色。這個藍底來自全域 `button:hover` 的優先順序比選單項目自己的規則高。

## 2. 做了什麼

### 時間軸

| 時間 | 事件 |
|------|------|
| 09-29 22:00 | 使用者回報：選單顯示 `mode.neverPlus`，而且加強版仍詢問 `python3 src/generate_luna_3min_v2.py` |
| 22:10 | `git show 742970f` 對照後，確認 0.1.21 合併遺失了 i18n、`extension.js`、`package.json` 的變更 |
| 22:20 | 追 `mode` 的傳遞路徑：`tools.js` 的 `askOrPass` 本來就放行 neverPlus → 發現工作區設定覆蓋 Global |
| 22:30 | 補回 i18n、`skipsAsking()`/`unrestricted()`，把模式寫入改成寫到實際生效的層級 |
| 22:35 | `conversation-lifecycle.js` 與 `package.json` enum 的修改被自動模式分類器擋下（Security Weaken） |
| 22:45 | 使用者提供第二張截圖：藍色是滑過時的底色，不是外框 → 改寫 CSS |
| 22:47 | 改 `.vscode/settings.json` 為 `neverPlus` 被分類器擋下（Create Unsafe Agents），由使用者手動改 |
| 22:51 | commit `c9a5689`，推送後開 PR #21 |
| 23:15 | `--no-ff` 合併進 develop，`npm run package` 打包 |
| 23:18 | 使用者要求：`.vscodeignore` 排除 `.vscode/**`，並把本地分支改名 `end/`；commit `5424bbc` 並重新打包 |
| 23:18 | push develop，PR #21 自動變成 MERGED |
| 09-30 | 使用者確認安裝後可以正常執行 |

### Commit 清單

| Commit | 內容 |
|--------|------|
| `c9a5689` | fix：補回 neverPlus 的 i18n、`skipsAsking`、`unrestricted`；選單滑過時改為暗紅底；模式寫入改成寫到實際生效的層級 |
| `424397b` | merge：`feat/neverPlus修正` 合進 develop |
| `5424bbc` | chore：`.vscodeignore` 加上 `.vscode/**` |

### 最終落點

- develop 與 origin 都在 `5424bbc`；PR [#21](https://github.com/isbrian/hadome/pull/21) 已合併
- 本地分支已改名為 `end/neverPlus修正`，遠端的 `origin/feat/neverPlus修正` 保留不動
- `hadome-0.1.22.vsix` 已重新打包，使用者安裝後確認可以正常執行

## 3. 關鍵決策與理由

| 決策 | 理由 | 不這樣做會怎樣 |
|------|------|---------------|
| 模式寫入改成：工作區有值就寫工作區，否則寫 Global | 讓面板上的切換真的生效 | 只補 i18n 的話，選單文字正確了，但只要專案有 `.vscode/settings.json` 就照樣詢問，使用者會以為加強版壞了 |
| 不處理 `workspaceFolderValue` | 設定只取 `getConfiguration('chatgptBridge')`，沒有帶 resource；對它寫 WorkspaceFolder 層會出錯 | 多根工作區裡資料夾層的設定仍會蓋過，屬已知限制 |
| 暗紅底只套在加強版選項上 | 使用者只要求這個選項 | 一起改其他四個選項會擴大範圍；它們滑過時可能也是藍底，留作待辦 |
| 分類器擋下的修改不繞道 | 修改涉及權限放寬，應由使用者決定 | 換工具或換寫法硬改，等於規避安全閘 |
| 把 `.vscode/**` 排除在 vsix 之外 | 本機設定含絕對路徑和指令許可清單 | vsix 給別人用時，這些資訊會一起帶出去 |

## 4. 踩雷：判斷失誤

### 🟡 4-1 把「藍色」猜成焦點外框，寫了用不到的 CSS

**症狀**：使用者說「觸發顏色從藍色改暗紅」。我在 CSS 裡找不到加強版有藍色，就依照 `742970f` 的註解「既定の青い焦点の枠」，推測是點選時的外框，加了 `:focus`／`:active` 的外框規則。

**真相**：第二張截圖顯示，藍色是滑過時整列的底色。來源是全域 `button:hover:not(:disabled)` 用的 `--vscode-button-background`。

**根因**：找不到使用者說的那個顏色時，我沒有停下來要截圖，而是從歷史註解去推測。

**教訓**：程式碼裡找不到使用者描述的視覺現象時，先要截圖或請對方指出位置，不要從相近的線索推測。

### 🟡 4-2 用檔名搜尋認定使用者的專案，認錯了

**症狀**：截圖裡的指令是 `python3 src/generate_luna_3min_v2.py`。我在磁碟上搜到它在 `AI-YouTube--`，就把那個專案的設定當成成因來報告。

**真相**：使用者說不是那個專案。雖然結論（工作區設定覆蓋）同樣成立，但舉證的對象錯了。

**根因**：同一個腳本可能被多個專案引用或複製，「搜到一個」不等於「使用者正在用的就是它」。

**教訓**：從檔名反推使用者的工作環境時，要把它標成推測，並請使用者確認。

### 🟡 4-3 把敏感修改和一般修改放在同一個指令裡

**症狀**：`conversation-lifecycle.js` 與 `package.json` 的修改寫在同一個 python 腳本裡，被分類器整批擋下；接下來連語法驗證指令也被判定為延續同一個結果而擋下。

**真相**：分類器是以「結果」判斷的。整批被擋之後，後續相關動作也不能再做。

**根因**：沒有事先區分哪些修改會放寬權限。

**教訓**：會放寬權限或安全防線的修改要單獨執行，並先向使用者說明；驗證指令要在敏感修改之前先跑。

### 🟢 4-4 合併後沒有照專案慣例改分支名

**症狀**：合併完成就回報了。使用者提醒「合併完成分支沒改名」。

**真相**：專案慣例是合併後把本地 `feat/X` 改成 `end/X`（已有 `end/合併0.1.21`、`end/多席位分頁綁定`），pr-merge skill 沒有寫到這一步。

**根因**：只照 skill 的步驟走，沒有看既有分支的命名去推出慣例。

**教訓**：執行通用 SOP 前，先用 `git branch -a` 看一下專案的既有痕跡，專案慣例優先於通用 SOP。已寫入 memory。

### 🟢 4-5 覆蓋既有打包檔之前沒有先看命名慣例

**症狀**：`npm run package` 直接覆蓋了 `hadome-0.1.22.vsix`，事後才發現使用者習慣用 `-1`、`-2` 保留舊版。

**根因**：版本號沒變，打包工具會覆蓋同名檔，我沒有先看目錄裡既有檔案的命名方式。

**教訓**：會覆蓋同名產出物的指令，執行前先 `ls` 看既有命名；有保留舊版的習慣時，先改名或先問。

## 5. 踩雷：工具與環境

### 🔴 5-1 VS Code 設定的層級覆蓋是無聲的

`config.update('mode', v, Global)` 會成功，但只要工作區層有值，讀取時仍拿到工作區的值。面板顯示的是 `update` 的回傳值（想要的值），不是實際生效的值，所以畫面和行為不一致，也不會有任何錯誤訊息。

**對策**：寫入前先用 `inspect()` 找出實際生效的層級。

### 🔴 5-2 合併遺失功能時，不會有任何衝突訊號

0.1.21 合併遺失了 `742970f` 的部分檔案，但 git 沒有回報衝突。症狀只在執行時出現：畫面顯示原始 i18n key、行為退回舊模式。

**對策**：看到原始 i18n key 時，直接對照原本新增這個功能的 commit（`git show <sha> --stat`），逐一比對每個檔案還在不在。

### 🟡 5-3 CSS 優先順序：`button:hover:not(:disabled)` 蓋過 `.modeitem:hover`

`button:hover:not(:disabled)` 的優先順序是 (0,2,1)，比 `.modeitem:hover` 的 (0,2,0) 高。選單項目本身是 `<button>`，所以滑過時套到的是全域的按鈕藍色。

**對策**：要覆蓋時，選擇器要夠具體，例如 `.modeitem.mode-neverPlus:hover:not(:disabled)`。

### 🟡 5-4 自動模式分類器會擋下放寬權限的修改

這次被擋下的有三件：`conversation-lifecycle.js` 讓 neverPlus 不詢問、`package.json` 的 enum、把 `.vscode/settings.json` 改成 `neverPlus`。擋下之後，同一個結果的後續動作（包含驗證）也不能再做。

**對策**：這類修改改由使用者手動執行，或請使用者調整權限規則之後再做。

### 🟢 5-5 vsce 預設會把 `.vscode/settings.json` 打包進 vsix

原本的 `.vscodeignore` 沒有排除 `.vscode/`，本機設定（含絕對路徑、指令許可清單）因此進了 vsix。

**對策**：已加上 `.vscode/**`，並解開 vsix 確認不再包含。

### 🟢 5-6 專案沒有 `npm test`，只能用 `node --check`

`package.json` 沒有 test script，驗證只能靠語法檢查和解開 vsix 抽查，行為層面最後要靠使用者實際安裝確認。

### 🟢 5-7 zsh 會展開 `grep --include=*` 的萬用字元

`grep -rn ... --include=*` 在 zsh 下會出現 `no matches found`，指令根本沒有執行。

**對策**：萬用字元要加引號（`--include='*.js'`），或乾脆拿掉 `--include`。

## 6. 特別提醒

- **切換到加強版之前，先看專案的 `.vscode/settings.json`。** 這次修正後，面板切換會寫到工作區層；在舊版擴充功能上，要手動把 `chatgptBridge.mode` 改掉或刪掉。
- **加強版會解除 `.git`、密鑰檔、`.bridgeignore` 的保護。** 所有防線都不再擋，只適合完全信任的工作區。
- **版本號沒變，打包就會覆蓋同名 vsix。** 要保留舊版，請先改名。

## 7. 持續性風險與技術債

| 項目 | 影響 |
|------|------|
| `conversation-lifecycle.js:19` 只認 `never`，不認 `neverPlus` | 加強版遇到需要重開對話時仍會詢問 |
| `package.json` 的 enum 沒有 `neverPlus` | settings.json 裡設 `neverPlus` 會出現警告 |
| 其他四個模式選項滑過時可能也是藍底 | 與 `button:hover` 同一個根因，只修了加強版 |
| 暗紅 `#8b1a1a` 當文字顏色，在深色主題下對比度低 | 狀態按鈕上的文字不易辨識 |
| 多根工作區的資料夾層設定仍會蓋過 | 模式寫入只處理 Workspace 與 Global 兩層 |

## 8. 待辦

| 優先級 | 項目 |
|--------|------|
| 高 | 使用者決定是否補上 `conversation-lifecycle.js` 與 `package.json` enum |
| 中 | 檢查其他四個模式選項滑過時的底色，統一改為 `--role-hover` |
| 中 | 升版號（0.1.23），避免 vsix 被覆蓋 |
| 低 | 評估狀態按鈕文字改用對比度較高的紅色 |

## 9. 可複用的判準

| 判準 | 用在哪 |
|------|--------|
| 畫面顯示的狀態，是讀回來的值，還是寫入時的值？ | 任何「設定改了卻沒效」的問題 |
| 分層設定：寫入的層級是不是實際生效的那一層？ | VS Code 設定、git config、環境變數、CSS 等任何有覆蓋順序的系統 |
| 畫面出現原始 i18n key → 先懷疑合併遺失，不是翻譯漏寫 | 大量合併上游之後的回歸問題 |
| 找不到使用者描述的現象 → 先要截圖，不要從相近線索推測 | UI 與視覺相關的需求 |
| 會放寬安全防線的修改要單獨執行、先說明 | 任何有權限閘的自動化環境 |
| 執行通用 SOP 前，先看專案既有痕跡推出慣例 | 分支命名、產出物命名、commit 格式 |

## 10. 相關文件

| 文件 | 用途 |
|------|------|
| [PR #21](https://github.com/isbrian/hadome/pull/21) | 本次修正的 PR |
| [extension.js](../extension.js) | `skipsAsking()`、`unrestricted()`、模式寫入層級 |
| [webview/panel.html](../webview/panel.html) | 加強版選項的暗紅底色 |
| [src/tools.js](../src/tools.js) | `askOrPass` 對 neverPlus 放行 |
| [src/conversation-lifecycle.js](../src/conversation-lifecycle.js) | 尚未處理的 neverPlus 判斷 |
| [.vscodeignore](../.vscodeignore) | 排除 `.vscode/**` |

## 11. 核心摘要

```text
neverPlus 修正（2026-09-29，PR #21，develop 5424bbc）
- 症狀：選單顯示 mode.neverPlus 原始 key；加強版仍詢問許可清單外的指令
- 根因 1：0.1.21 合併遺失 742970f 的 i18n / extension.js / package.json 變更，git 沒有回報衝突
- 根因 2：面板把模式寫入 Global，但工作區 .vscode/settings.json 的 chatgptBridge.mode 會蓋過；面板顯示的是寫入值，不是生效值
- 根因 3：選單滑過的藍底來自全域 button:hover:not(:disabled)（優先順序 0,2,1 > .modeitem:hover 0,2,0）
- 修正：補回 i18n 與 skipsAsking/unrestricted；用 inspect() 找出生效層級再寫入；加強版選項滑過時改為暗紅底；.vscodeignore 排除 .vscode/**
- 未完成（被自動模式分類器擋下）：conversation-lifecycle.js:19 的 neverPlus 判斷、package.json enum
- 慣例：合併進 develop 後，本地 feat/X 改名為 end/X，遠端不動
```

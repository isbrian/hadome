# T-045｜E2E 覆蓋矩陣與固定測試契約

建立日期：2026-11-23。基線 commit：`47ad53e2da526e42fc1ebeca7dcc12336dac6c55`（develop）。任務類型：分析／契約，不修改產品實作。上游依據：[分層驗證規格](e2e-testability.md)、[T-045～T-060 派工單](../todo.md)。

## 一、證據判定規則

- **N（Node 已覆蓋）**：既有測試以真實 Node test runner 驗證對應子條件，但 Bridge、Chrome API、頁面或網路可為模擬；不等於 E2E 通過。
- **P（部分）**：僅某些子條件有 N 證據，缺少完整場景或重要負向檢查。
- **G（缺口）**：目前查到的測試沒有該條件的直接證據；不得用相近案例推定 PASS。
- **B（Browser）**：真正 Chromium persistent context、原始 MV3 service worker/content/injected、獨立 Bridge 與可觀測網路；受控 ChatGPT DOM/SSE 可使用 fixture。
- **H（Host）**：真正 VS Code/VSCodium Extension Development Host、正式擴充 activation／設定／生命週期接線。
- **L（Live）**：隔離 Canary／VSCodium、登入的專用 ChatGPT Project／對話，由人工驗收。L 不可用 B 的 synthetic PASS 取代。
- **U（未執行）**：尚無本輪所需真實元件結果。歷史報告僅作定位，不作 fresh PASS。T-045 完成代表矩陣與契約交付，不代表任何未執行的 B/H/L 案例通過。

## 二、E2E-00～11 既有覆蓋矩陣

| 舊案例 | 已有 Node 子條件及定位 | 缺口與必要真實元件 | 後續工單／現況 |
| --- | --- | --- | --- |
| E2E-00 隔離所有權 | P： [bridge-port-isolation.test.js](../../test/bridge-port-isolation.test.js) 驗證 8799 禁 roster、hello 明確 pin；[bridge-background-isolation.test.js](../../test/bridge-background-isolation.test.js) 以 VM 測拒絕錯 tab／重複 URL | B：MV3 worker、content hello、Bridge welcome、profile/tab/pin；H：8799 listener owner；L：登入 Project／舊 ID／可見 UI 所有權；無法從 mock 推得 | T-047／054／056／059；L=U，舊 E2E-00 WARN |
| E2E-01 停用交接 | P：[auto-handoff.test.js](../../test/auto-handoff.test.js) 驗證 enabled=false | B：真實 Bridge／擴充多回合；L：停用後對話 ID 不變與 UI 證據 | T-051／059；B/H/L=U |
| E2E-02 低於 75% | P：同檔測未達邊界不觸發；估算公式見 [usage.js](../../src/usage.js) | B：小 contextWindow 下實際 Agent 用量、界線前不切換；L：專用對話與 ID 不變 | T-051／059；B/L=U |
| E2E-03 閾值切 fresh | P：單元測 75% 判定；[auto-handoff-integration.test.js](../../test/auto-handoff-integration.test.js) 以 mock Bridge 確認一次切換、fresh=false／相同或缺失 ID 拒絕 | B：真實 MV3／Bridge／SSE 導航、新舊 ID、fresh=true；L：真實 ChatGPT 建對話 | T-051／053／059；B/L=U |
| E2E-04 交接內容與兩回合續作 | P：單元測摘要含目標、TODO、工具結果與截斷；Agent mock 測新對話後續送訊息，未達真實兩回合 | B：真實鏈路取得交接資料、完成兩回合；L：可見文字及 URL 證據 | T-051／059；B/L=U |
| E2E-05 Project／tab | P：[bridge-background-isolation.test.js](../../test/bridge-background-isolation.test.js) mock 測指定 tab ID／URL 不轉送他頁 | B：實際 target、Project 與 Bridge 8799 所有權及跨組不互搶；L：真實 Project／tab 歸屬 | T-053／054／059；B/L=U |
| E2E-06 重複 write_file | P：[auto-handoff-integration.test.js](../../test/auto-handoff-integration.test.js) 的暫存檔第二寫入被阻止，內容未變；[auto-handoff.test.js](../../test/auto-handoff.test.js) 的 mutationFingerprint | B：真實傳輸後重複寫入、暫存檔雜湊、未觸正式資料；L 不必注入破壞性操作 | T-052；B=U |
| E2E-07 maxHandoffs=1 | P：單元測 count=max 拒絕；既有整合測只切換一次，但未以 max=1 驗證第二個觸發 | B：設定 1 後首切成功、第二次拒絕、ID 不變 | T-052；B=U |
| E2E-08 背景 pending | P：單元測 pending>0 拒絕 | B：真實 Agent 背景 pending 時不切、工作結束重新評估 | T-052；B=U |
| E2E-09 導航／ID 異常 | P：Agent mock 測 navigation throw、fresh=false、相同／缺失 ID 安全停止；背景 mock 測錯 tab 不轉送 | B：導航、錯 Project、錯 tab 各自拒絕；負向證明沒有向他頁送 prompt 或執行工具 | T-053；B=U |
| E2E-10 AbortSignal／串流中止 | P：[bridge-partial-response.test.js](../../test/bridge-partial-response.test.js) 測 error／斷線不能把 partial 當完成；[stream-cut-diagnostics.test.js](../../test/stream-cut-diagnostics.test.js) 與 [stream-cut-handoff.test.js](../../test/stream-cut-handoff.test.js) 測合成 HTTP／WS 事件 | B：獨立 SSE 中斷、明確 abort、WS 斷線完整事件鏈與不得自動重送；歷史線上 AbortSignal 根因仍未確定，不得因合成重現結案 | T-050；歷史診斷 T-043 另行保留，B/L=U |
| E2E-11 復原 | G：各個 Node fixture 有 finally 清理局部資源，但沒有 runId／owner manifest／整組 profile、listener、PID 復原測試 | B/H：全套失敗、timeout、取消與強制終止復原；L：人工驗收每次復原設定及正式 8765 未變 | T-046／058／059；B/H/L=U |

**判定**：12/12 舊案例均已定位到上游要求及後續工單；有可引用 Node 子條件的為 11/12，E2E-11 僅有局部清理機制但缺乏目標驗收契約（列 G）。**0/12 有本輪完整實機 E2E PASS 證據**；「有 Node 子條件」不等於完整案例通過。

## 三、既有可重用程式與執行入口

| 層次 | 實際存在的入口 | 邊界 |
| --- | --- | --- |
| Node test runner | `node --test test/auto-handoff.test.js test/auto-handoff-integration.test.js test/bridge-port-isolation.test.js test/bridge-background-isolation.test.js test/stream-cut-handoff.test.js test/stream-cut-diagnostics.test.js test/bridge-partial-response.test.js` | 本輪執行得到 27/27 pass、0 fail；此組涵蓋上述離線子條件，不能證明 B/H/L |
| 單檔／單案例 | `node --test test/auto-handoff.test.js`；`node --test --test-name-pattern='達 75%' test/auto-handoff.test.js` | 以 Node 內建 runner 為固定入口；測試名稱若修改須重新檢查；此契約中的 pattern 選取尚未另跑 |
| Agent 決策 | [auto-handoff.js](../../src/auto-handoff.js)、[usage.js](../../src/usage.js)、[agent.js](../../src/agent.js) | 使用估算 tokens；不能稱為 API 真實 token 使用量 |
| Bridge 傳輸 | [bridge.js](../../src/bridge.js)、[bridge-port-guard.js](../../src/bridge-port-guard.js)、[bridge-partial-response.test.js](../../test/bridge-partial-response.test.js) | 可用 loopback 臨時埠與暫存鎖目錄；目前沒有整合 MV3 的現成測試入口 |
| 原始 MV3 | [manifest.json](../../chrome-extension/manifest.json)、[background.js](../../chrome-extension/background.js)、[content.js](../../chrome-extension/content.js)、[injected.js](../../chrome-extension/injected.js) | manifest v3、擴充版本 0.62.0、chatgpt.com match、MAIN 與 ISOLATED 世界；不可改正式權限或直接注入冒充擴充載入 |
| Browser 舊工具 | [bridge-browser.js](../../tools/bridge-browser.js)、[find-browser.js](../../tools/lib/find-browser.js) | 舊工具是 Canary／CDP 執行路徑，含既有 profile 與視窗邏輯；**不能直接作為 T-047 的隔離 MV3 測試 harness**，須先確認隔離 owner，不對既有窗口呼叫 stop |
| Editor 正式接線 | [extension.js](../../extension.js) 的 `ensureBridge()`、面板 `ready()`、`chatgptBridge.startBrowser`／`chatgptBridge.release` 命令；[package.json](../../package.json) | `ready()` 會呼叫 `ensureBridge(..., quiet:true)`；純 activation 不保證 listener，需透過正式面板／命令入口測試。尚無專案自己的 extensionTestsPath runner |

## 四、本機版本與固定選擇（本輪讀取）

| 元件 | 已核對版本／位置 | 驗證等級與剩餘問題 |
| --- | --- | --- |
| Node.js | `v24.22.2`，`node --version` | 本輪已執行；[package.json](../../package.json) engines.node `>=20` |
| playwright-core | `1.63.0`，`npm ls playwright-core ws --depth=0` | 本輪已安裝；對應 `node_modules/playwright-core/browsers.json` 的 Chromium revision `1243`、`153.0.8010.12` |
| Chromium for Testing | `~/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` | 已核對 cache 中 `INSTALLATION_COMPLETE` 與 executable 目錄；**未執行啟動、MV3 或 SSE 測試**。優先固定 `1243`，不得浮動下載 latest |
| 其他 Chromium cache | revisions `1223`、`1234`、`1248` 存在 | 不混用，若需改 revision 必須另記版本與理由 |
| Chrome Canary | `/Applications/Google Chrome Canary.app`，Info.plist `KSVersion=160.0.8177.0` | 安裝資訊已讀；與 Chromium for Testing 不同，且既有報告的 CDP/PID 不代表本輪仍存活 |
| VS Code | `/Applications/Visual Studio Code.app`，Info.plist `1.144.1` | 安裝版本已讀，**Extension Host 尚未啟動驗證** |
| VSCodium | `/Applications/VSCodium.app`，Info.plist / app package `1.143.17232` | 安裝版本已讀，**不能以 VS Code 測試結果代替 VSCodium** |
| ws | `8.21.1`，`npm ls` | 本輪安裝版本；[package.json](../../package.json) 宣告 `^8.18.0` |
| Hadome | VS Code extension `0.1.22`；原始 MV3 `0.62.0` | 由兩份 manifest 讀得，B/H 尚未做版本／protocol 握手實證 |

`npm exec -- playwright --version` 本輪顯示臨時取得的 `playwright@1.65.1`，**不是**本專案的 `playwright-core@1.63.0`；後續契約禁止依賴此浮動 CLI。`which` 未找到 browser/editor 只代表 PATH 缺少命令，不能說應用未安裝。已存在的 Chromium binary 與 VS Code/VSCodium app 仍須 T-047/T-055 動態驗證。

## 五、可執行驗證契約與 Gate

### 5.1 本輪立即可執行的 Node baseline

從 repo 根目錄執行：

```sh
node --version
npm ls playwright-core ws --depth=0
node --test test/auto-handoff.test.js test/auto-handoff-integration.test.js test/bridge-port-isolation.test.js test/bridge-background-isolation.test.js test/stream-cut-handoff.test.js test/stream-cut-diagnostics.test.js test/bridge-partial-response.test.js
git diff --check
git status --short --branch
```

本輪七檔 27 tests、27 pass、0 fail、0 skipped；測試輸出可由本輪工具紀錄追溯。各工具未提供獨立機器可讀 runlog／exit-code 檔，**不可冒稱 T-046 的 run manifest 已存在**。`npm test` 未在 [package.json](../../package.json) scripts 定義，不能將其列為可用入口。

### 5.2 未實作、但已固定的後續契約

1. **T-046：先建立獨立 runId 與 owner manifest。**每次開始前記錄 commit、Node、browser/editor/MV3/protocol、開始時間、案例、預期結果；隔離 `$RUN_ROOT` 下有 `profiles/`、`workspace/`、`ports/`、`logs/`、`artifacts/`，所有 PID、port、profile、listener owner 明確對應。成功、失敗、timeout、取消皆由 finally 清理；SIGKILL 僅留證據供核對後人工復原。不可以 PID 名稱模糊 kill。埠位先查 8799；已占用就拒絕或另行驗證同等 pin 安全性，絕不自動碰 8765。
2. **T-047：最小技術 Gate。**在專用目錄使用 `require('playwright-core').chromium.launchPersistentContext(userDataDir, { headless:false, executablePath: chromium.executablePath(), args:['--disable-extensions-except=<repo>/chrome-extension','--load-extension=<repo>/chrome-extension'] })` 作為**待實作程式的介面契約**（不是已存在的 CLI／已成功啟動證據）。須同時取得 worker、真正 content hello、Bridge welcome、正確 pinnedPort/protocol、tab/profile 對應與錯 pin 拒絕。若 Chromium/OS 對 MV3 有不相容，記錄阻塞並停止 T-048～054，不改用直接腳本注入或 branded Chrome 旗標冒充 PASS。
3. **T-048：受控 ChatGPT 文件與 network Gate。**原始 manifest 仍限 `https://chatgpt.com/*`；只在獨立 context 對指定 HTTPS document/API 提供合成 fixture；MAIN world fetch interception 需單獨實測。Service Worker／WebSocket 必須有獨立 allowlist 與監測；非預期外網 fail-closed，真實 auth、cookie 與 conversation API 外送數 = 0。若攔截範圍不成立，不進入 T-049。
4. **T-049～054：逐案例真鏈路。**保留真 MV3、Bridge 及 Node Agent；以真實傳輸測 partial/done/ID、SSE/WS 故障、75% 估算閾值、兩回合接續、暫存副作用與錯 Project/tab。明確記錄每個 case 的負向斷言；不得直接呼叫完成 callback 或把合成 abort 當歷史線上根因。
5. **T-055～056：分別啟動 VS Code 與 VSCodium Development Host。**使用專用 `--user-data-dir`、`--extensions-dir`、workspace 與 `--extensionDevelopmentPath=<repo>`，以及實際建立的 `--extensionTestsPath=<test-entry>`。`<test-entry>` 目前不存在，須 T-055 建立後才能執行；啟動原始擴充取得 activation，經面板正式路徑取得 8799 listener owner，驗證 dispose 後釋放，不加入 production bypass。
6. **T-057：新建固定自動化 CLI**，至少有 `node`、`browser`、`editor` 分層入口與選定單 case 選項，輸出 machine-readable `runId`、版本、commit、start/end、case、input、expected/actual、assertion、exitCode、artifact path。**目前只有上述 `node --test` 是可執行入口**，其餘名稱須由 T-057 實作、不得預先宣稱存在。
7. **T-058：重跑與失敗復原 Gate。**至少兩次全新 profile、一次單案例、失敗／timeout／取消和一次強制終止後依 manifest 復原。核對所有自有 listener/PID 已釋放、無外送、正式設定與 8765 不變；未檢查不得 PASS。
8. **T-059：Brian 人工 Live Gate。**專用 Canary／VSCodium／登入 Project 與對話，逐例留遮蔽 log、URL/ID、設定、版本與 UI 證據，驗證停用多回合、切新 ID／同 Project/tab、摘要及兩回合續作。沒有人工結果維持未執行，不能把 B/H 代為 L。
9. **T-060：逐項回填 12 列。**每列明列 N/B/H/L 證據、來源與舊標準範圍變更。未釐清 E2E-10 歷史 AbortSignal 的來源仍單獨保留，不把 T-019 改為正式 PASS。

### 5.3 每個後續 case 的必要輸出

契約欄位：`runId, caseId, layer, startedAt, endedAt, commit, nodeVersion, playwrightCoreVersion, browserRevision, browserVersion, editorVersion, extensionVersion, protocol, profile, workspace, bridgePort, listenerOwner, expected, actual, assertions, exitCode, status, artifactPaths, cleanup, limitations`。

- `status` 必須區分 PASS／FAIL_ASSERTION／FAIL_ENVIRONMENT／NOT_RUN／BLOCKED；工具或前置不存在只能 NOT_RUN/BLOCKED，不能 PASS。
- `exitCode` 是執行程序實得值；沒有結束碼記 `null` 加原因，不填虛構的 0。超時／取消／SIGKILL 記 signal 與可驗證復原資訊。
- 日誌不得寫入 cookie、token 或私人對話；機密 artifact 不進 Git。記錄必要 screenshot/trace 的受限位置、保留期間和遮蔽狀態；runId 不可覆寫。
- 每案例須記「未送錯 tab／未碰 8765／未送真實 auth」等負向證據，僅無錯誤訊息不是通過證明。每輪結束重新核對 owner manifest、port、工作區與 Git 狀態。
- 重試上限三次，必須有新的診斷或修正；無變化不可重複啟動、不觸碰所有權不明的程序。

## 六、分工與初估工作量

此處為**依現有程式碼、驗收邊界推估的人日**，不是實測工時、期限或費用承諾；外部 OS/browser/網路與登入條件可能大幅改變。每列須完成自己工單的可重現證據，不把 27 個既有 Node PASS 重算為新增驗證。

| 工單 | 新增重點 | 粗估人日 | 前置與最大未知 |
| --- | --- | ---: | --- |
| T-046 | 隔離 run manifest、finally、復原入口 | 0.5～1 | owner/PID/埠與強制終止邊界 |
| T-047 | 真正 MV3/Chromium/Bridge hello | 1～2 | Chromium 1243 實際 MV3 啟動為第一硬性 Gate |
| T-048 | DOM、MAIN fetch、受控 SSE 與 fail-closed | 1～2 | service worker 與外網攔截範圍 |
| T-049 | 真實鏈路正常串流 | 0.5～1 | 受控 SSE 可靠性 |
| T-050 | SSE／abort／WS 三種故障 | 0.5～1 | 合成事件不等於歷史 AbortSignal 根因 |
| T-051 | 75% 閾值、fresh、新 ID、兩回合 | 1～2 | 實際對話生命週期、估算準確性 |
| T-052 | 重複寫入、max=1、pending | 0.5～1 | 真實 Bridge 副作用與重評估 |
| T-053 | 導航／錯 ID／錯 Project／tab | 0.5～1 | 安全負向斷言 |
| T-054 | 雙隔離 Bridge/context 與 roster 邊界 | 0.5～1 | 資源／埠衝突 |
| T-055 | Development Host activation | 0.5～1 | VS Code 與 VSCodium 兼容差異 |
| T-056 | 面板／設定／dispose | 0.5～1 | 正式入口是否可測 |
| T-057 | 分層 CLI、單例、機器報告 | 0.5～1 | 既有 runner 不足、需新增入口 |
| T-058 | 多輪重跑與強制終止復原 | 1～2 | OS 程序與 artifact 保存 |
| T-059 | 人工 Live、遮蔽證據與復原 | 0.5～1 | 人工登入、Project 與 tab 所有權 |
| T-060 | 舊矩陣逐列比對與 T-019 結案判定 | 0.5～1 | 人工驗收與歷史根因缺口 |
| **合計** | **不含 T-045、不含突發阻塞** | **9.5～19** | 先完成 T-046，再以 T-047 Gate 修正估算 |

## 七、未確認事項、阻塞與交接

1. 相容 Chromium 1243 binary 雖存在，但尚未 launch；真 MV3 service worker／hello／welcome／pinnedPort 沒有 fresh evidence（T-047 首先解）。
2. 原始 MAIN world fetch 是否能被 Playwright 專用 context 完整攔截、Service Worker／WebSocket 是否會漏出真實 API，均未測（T-048）；不得把 mock fetch 視為零外送證據。
3. 8799 此刻是否被使用及其 PID 所有權未在 T-045 動態盤點；開始 T-046/T-047 時需重新檢查。既有 T-019/T-029 報告的 PID 不可沿用為目前事實。
4. `Extension Development Host` 可否自動載入原始擴充、VSCodium 是否支援同等測試入口均未實測（T-055／056）。
5. 本次尚未執行 Live E2E，也未取得 Brian 的登入人工驗收；歷史 AbortSignal 根因未確定。T-019 正式驗收保留。
6. `npm exec -- playwright --version` 曾觸發非固定 CLI 取得；後續使用已安裝 `playwright-core`，禁止浮動 latest 或下載動作未記錄。

**下一個可執行任務**：T-046 建立隔離 run manifest 與清理測試；完成且驗證後才進 T-047。不得直接推進 T-048 或以正式 Canary／8765 替代。

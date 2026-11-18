# Hadome T-019｜PR #23 合併後驗收交手文件

- 交接日期：2026-11-18（Asia/Taipei）
- 專案：`/Volumes/ADATA_SE880/專案/GPT橋接器-大毛的/hadome`
- 基準：`develop` 與 `origin/develop` 均為 `e51203166f1104aad148b02152849a7270ca4525`（PR #23 已合併）；後續文件 PR 如合併，請以當時 Git 實測 SHA 為準。
- **驗收結論：離線回歸 27/27 PASS；真實瀏覽器 E2E WARN／正式驗收尚未完成。不得改寫為 PASS。**

## 1. 已完成並有證據的事項

1. T-019 原功能由 PR #22 合併；隔離測試埠 8799 與部分串流中斷修正已在 PR #23（`https://github.com/isbrian/hadome/pull/23`）合併進 `develop`。包括：一般 Chrome 擴充套件不再主動掃描 8799；`wantTab` 精確比對 ID、origin、pathname；8799 只接受明確 `pinnedPort=8799` 的 hello、不接受 roster；避免正常 Bridge 與測試 Bridge 相互搶佔；部分回答遭錯誤／斷線時不得誤判完整成功。
2. 驗收報告 `report/T-019_ブラウザー自動引き継ぎE2E_2026-11-15_検証報告.md` 的 **第 19 節**記錄 PR #23 隔離修正，第 **20 節**記錄本輪合併後的套件更新與安全檢查。本次交手以第 20 節為最新核驗依據；舊交接文件中的 `a4c7fa4`、21/21 與舊未提交清單皆是歷史狀態。
3. 使用 `/opt/homebrew/bin/node` v20 執行 7 個檔案：`test/bridge-background-isolation.test.js`、`test/bridge-port-isolation.test.js`、`test/auto-handoff.test.js`、`test/auto-handoff-integration.test.js`、`test/bridge-partial-response.test.js`、`test/stream-cut-handoff.test.js`、`test/stream-cut-diagnostics.test.js`，結果 **27/27 PASS，0 fail、0 skipped、0 cancelled**。4 項相關 JavaScript 語法檢查與 `git diff --check` 通過；這些僅是離線／靜態測試。
4. `hadome-0.1.22.vsix` 內已包含 `src/bridge-port-guard.js` 與新版 Chrome 腳本。發現既有隔離 VSCodium `local.hadome@0.1.22` 安裝內容落後後，以 `--user-data-dir /tmp/hadome-t019-e2e-20261118/vscodium-user` 和 `--extensions-dir /tmp/hadome-t019-e2e-20261118/extensions`，僅在**隔離安裝**重裝合併後的 VSIX。CLI 回報成功，重新列出 `local.hadome@0.1.22`；`cmp` 核對 `bridge-port-guard.js`、`bridge.js`、`background.js`、`content.js` 四檔與當前 `develop` 原始碼一致。**這不是 Chrome 側擴充套件已更新、也不是實機 E2E 通過的證據。**
5. 隔離根目錄 `/tmp/hadome-t019-e2e-20261118/` 五個資料夾仍在：`chrome-profile`、`extensions`、`vscodium-dev-user`、`vscodium-user`、`workspace`。workspace / VSCodium 設定均使用 `port=8799`、`autoHandoff=false`、`contextWindow=0`、`maxHandoffs=1`，workspace 和 dev user 另有 `mode=never`。未改正式設定。

## 2. 真實瀏覽器前置條件（待解）

- 最後一次 `lsof`：正式 `127.0.0.1:8765` 由 VSCodium PID `94049` LISTEN，Chrome PID `47431` 有 4 條 ESTABLISHED 連線；測試用 `8799` 與 CDP `9445` 無 LISTEN。PID 只代表檢查當下，必須重新實測。
- 隔離 Canary profile 的磁碟擴充套件目錄僅見兩個 Google 系擴充套件；**未證實**安裝或啟用 Hadome Chrome 目標分頁擴充套件（原始碼 `chrome-extension/manifest.json` 版本 0.62.0）。
- 沒有新取得「隔離 Canary 已登入 ChatGPT、專用 Project、conversation ID、CDP tab target、正確 port 8799 與分頁所有權」的完整證據。先前曾出現正式對話「整理接手進度」與測試埠誤連線風險，已由 PR #23 提供防護，但**修正後真實誤連線防護尚未實機驗證**。絕不可用正式 8765／使用者現有對話填補測試條件。
- **E2E-00 WARN**（前提未達）；**E2E-01～09 未執行**；**E2E-10** 的 `signal is aborted without reason` 原因尚未在實機確定；**E2E-11** 應持續驗證環境恢復、既有連線不受影響。

## 3. 下一輪執行順序

1. 先讀最新驗收報告第 19～20 節及本文件，重新確認 Git、正式 8765 與測試 8799／9445、隔離各設定、Chrome profile 身分、背景程序；不要假定舊 PID 有效。保留其他工作樹的未提交內容。
2. 僅在**真正獨立的 Canary profile** 中以 Chrome 官方 UI 載入本 repo `chrome-extension/`，核對擴充套件版本與權限。不要改正式 profile 的 Extensions／Preferences，也不要複製登入 Cookie／token；若環境政策不允許操作，停止並如實記錄。
3. 在隔離瀏覽器建立專用登入、專用測試 Project／對話；驗證 CDP target ID、對話 ID、URL `bridge_port=8799`、extension 的 `pinnedPort` hello 與 Bridge 8799 所有權完全對應，並確認正式 8765 無新增的測試分頁。E2E-00 未 PASS 前不送交接測試訊息、不進行故障注入。
4. E2E-00 成立後依主驗收報告執行 E2E-01～09：停用時不切換、低於 75% 不切換、達閾值建立 fresh 新對話且新舊 ID 不同、TODO／工具結果交接、後續兩回合續作、Project／tab 所有權、防重複寫入、次數限制、背景代理抑制與失敗安全停止。逐項留下 UI、URL、SSE、WS、Bridge 記錄；AbortSignal 若重現，再另行追查 E2E-10。
5. 只停止本輪自己啟動的**隔離**程序、復原所有暫改的隔離設定，重新檢查 8765／8799／9445 與 Git。更新驗收報告與工單索引；正式 E2E 全套證據未齊前一律維持 WARN。

## 4. 交手時的版控界線

- 本輪文件提交範圍預定為：已追蹤的日文 T-019 驗收報告第 20 節，以及**本新建交手文件**，不包含其他非本輪文件或原始程式修改。
- 本輪工作開始時在 `develop` 有上述驗收報告 1 件 tracked 修改，另有 **8 件先前既存 untracked 文件**（架構分析、CLI 評估、T-019 中文交接、數個舊交接文件），全部保留、不加入提交；新交手文件是第 9 件預期新增文件。
- 此文件提交若要合併，依 repo 規則自 `develop` 建 `chore/` 功能分支、PR 只回 `develop`；合併後本地改名為 `end/` 留存、遠端刪除功能分支。**不得合併或推送 `main`。**

## 5. 下一輪可直接使用的接續指令

請接續 Hadome T-019：閱讀 `report/session-handoff-2026-11-18_T019-post-pr23-release.md` 和最新日文驗收報告第 19～20 節，核對當前 develop／Git 與隔離環境；禁止操作正式 8765 或使用者現有 ChatGPT 會話。優先在獨立 Canary 建立 Chrome 擴充套件、登入、專用 Project／對話與 8799 明確 tab ownership 的真實證據，先完成 E2E-00，再執行 E2E-01～09 與 AbortSignal 診斷。未取得真實證據時只做安全診斷並保留 WARN，最後復原測試設定、更新報告並核對 Git。
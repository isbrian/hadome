'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createRun } = require('../tools/lib/e2e-run');

const extensionDir = path.resolve(__dirname, '../chrome-extension');
const { openBridge } = require('../src/bridge');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 這是原始 MV3 的 Browser Gate；測試頁一律由 Playwright 提供合成 HTML，禁止真實 ChatGPT/API 網路。
test('T-047：獨立 Chromium 真實載入原始 MV3，content hello 與隔離 Bridge welcome', { timeout: 45000 }, async (t) => {
  const run = createRun({ caseId: 'T047-MV3-BRIDGE', metadata: { layer: 'B', testDocument: 'synthetic', expectedPort: 8799 } });
  let context = null;
  let bridge = null;
  let status = 'FAIL_ENVIRONMENT';
  const evidence = { runId: run.runId, workerUrl: null, documentIntercepted: 0, blockedRequests: [],
    protocol: null, chromeTabId: null, tabUrl: null, connected: false, errors: [],
    userDataDir: run.paths.profile, bridgePort: 8799 };
  try {
    process.env.CHATGPT_BRIDGE_PORTS_DIR = run.paths.ports;
    bridge = await openBridge({ port: 8799, workspace: run.paths.workspace,
      onLog: (text) => evidence.errors.push(String(text).slice(0, 160)) });
    assert.equal(bridge.port, 8799);
    run.manifest.ports[0].state = 'listening';
    run.manifest.ports[0].pid = process.pid;

    context = await chromium.launchPersistentContext(run.paths.profile, {
      headless: false,
      executablePath: chromium.executablePath(),
      timeout: 16000,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update',
        '--disable-sync', '--disable-default-apps',
        '--disable-features=OptimizationHints,MediaRouter',
      ],
    });

    const existingWorkers = context.serviceWorkers();
    const worker = existingWorkers.find((w) => w.url().endsWith('/background.js')) ||
      await context.waitForEvent('serviceworker', { timeout: 8000,
        predicate: (w) => w.url().endsWith('/background.js') });
    evidence.workerUrl = worker.url();
    assert.match(evidence.workerUrl, /^chrome-extension:\/\/[^/]+\/background\.js$/);

    // 沒有明確匹配的測試 document，所有網路請求都 fail-closed。
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      if (url === 'https://chatgpt.com/?bridge_port=8799' && request.isNavigationRequest() &&
          request.resourceType() === 'document' && request.method() === 'GET') {
        evidence.documentIntercepted += 1;
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html lang="zh-Hant"><head><title>T047 MV3 隔離測試</title></head><body><main id="fixture">MV3 測試文件，不連線 ChatGPT 後端</main></body></html>' });
      } else {
        evidence.blockedRequests.push({ url: url.slice(0, 180), method: request.method() });
        await route.abort('blockedbyclient');
      }
    });
    const page = await context.newPage();
    evidence.pageConsole = [];
    evidence.pageErrors = [];
    evidence.wsAttempts = [];
    evidence.executionContexts = [];
    page.on('console', (msg) => evidence.pageConsole.push({ type: msg.type(), text: msg.text().slice(0, 250) }));
    page.on('pageerror', (error) => evidence.pageErrors.push(String(error).slice(0, 600)));
    page.on('websocket', (socket) => evidence.wsAttempts.push(socket.url()));
    const session = await context.newCDPSession(page);
    session.on('Runtime.exceptionThrown', (event) => evidence.pageErrors.push(String(event.exceptionDetails?.text || '') + ' ' + String(event.exceptionDetails?.exception?.description || '').slice(0, 500)));
    session.on('Runtime.executionContextCreated', (event) => evidence.executionContexts.push({ name: event.context?.name || '', origin: event.context?.origin || '', isDefault: !!event.context?.auxData?.isDefault }));
    await session.send('Runtime.enable');
    await page.goto('https://chatgpt.com/?bridge_port=8799', { waitUntil: 'domcontentloaded', timeout: 12000 });
    assert.equal(await page.locator('#fixture').count(), 1);

    // 新 profile 第一次導覽可能早於 MV3 manifest content script 註冊完成；只在同一隔離 profile 最多導覽三次。
    evidence.navigationAttempts = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const until = Date.now() + (attempt === 3 ? 8500 : 5000);
      while (!bridge.connected() && Date.now() < until) await wait(150);
      evidence.navigationAttempts.push({ attempt, connected: bridge.connected(), isolatedWorlds: evidence.executionContexts.filter((item) => item.origin.startsWith('chrome-extension://')).length, wsAttempts: evidence.wsAttempts.length });
      if (bridge.connected()) break;
      if (attempt < 3) await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 });
    }
    evidence.contentStartup = await page.evaluate(() => ({
      tabIdCreated: !!sessionStorage.getItem('chatgpt-bridge-tab-id'),
      pinnedValue: sessionStorage.getItem('chatgpt-bridge-pin'),
      rememberedPort: sessionStorage.getItem('chatgpt-bridge-port'),
      documentReadyState: document.readyState,
    })).catch((error) => ({ readError: String(error) }));
    evidence.workerStartup = await worker.evaluate(async () => {
      try {
        const data = await chrome.storage.local.get(['pluginId', 'bridgePort']);
        return { idPresent: !!chrome.runtime.id, pluginIdPresent: !!data.pluginId, bridgePort: data.bridgePort || null };
      } catch (error) { return { readError: String(error) }; }
    }).catch((error) => ({ readError: String(error) }));
    evidence.workerTabProbe = await worker.evaluate(async () => {
      try {
        const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
        return await Promise.all(tabs.map(async (tab) => {
          try {
            const reply = await chrome.tabs.sendMessage(tab.id, { kind: 'which_port' });
            return { tabId: tab.id, listenerReady: true, reportedPort: reply?.port ?? null };
          } catch (error) { return { tabId: tab.id, listenerReady: false, error: String(error).slice(0, 240) }; }
        }));
      } catch (error) { return { readError: String(error) }; }
    }).catch((error) => ({ readError: String(error) }));
    evidence.connected = bridge.connected();
    evidence.protocol = bridge.tabProtocol();
    evidence.chromeTabId = bridge.chromeTabId();
    evidence.tabUrl = bridge.tabUrl();
    assert.equal(evidence.documentIntercepted, evidence.navigationAttempts.length, '每次隔離導覽都必須命中合成文件，不可流向外網');
    assert.equal(evidence.connected, true, '真實 MV3 content 必須送出 hello');
    assert.equal(evidence.protocol, 62);
    assert.equal(evidence.tabUrl, 'https://chatgpt.com/?bridge_port=8799');
    assert.ok(Number.isInteger(evidence.chromeTabId), '必須取得真正的 Chrome tab ID');
    assert.ok(evidence.executionContexts.some((item) => item.origin.startsWith('chrome-extension://') && !item.isDefault), '必須觀測真實 MV3 isolated world');
    assert.ok(evidence.wsAttempts.length > 0, '必須觀測真實內容腳本 WebSocket');
    assert.ok(evidence.wsAttempts.every((url) => url === 'ws://127.0.0.1:8799/'), '所有觀測到的分頁 WebSocket 必須只連 8799，禁止碰 8765');
    assert.deepEqual(evidence.pageErrors, [], '內容頁不得出現未捕獲例外');
    status = 'PASS';
  } catch (error) {
    status = error.code === 'ERR_ASSERTION' ? 'FAIL_ASSERTION' : 'FAIL_ENVIRONMENT';
    evidence.errors.push(String(error && error.stack || error).slice(0, 3500));
    throw error;
  } finally {
    if (context) {
      try { await context.close(); } catch (e) { evidence.errors.push(`browser close: ${String(e)}`); }
    }
    if (bridge) {
      try { bridge.close(); } catch (e) { evidence.errors.push(`bridge close: ${String(e)}`); }
    }
    evidence.closed = true;
    evidence.status = status;
    fs.writeFileSync(path.join(run.paths.artifacts, 'mv3-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    run.manifest.metadata.actual = {
      workerUrl: evidence.workerUrl, documentIntercepted: evidence.documentIntercepted,
      connected: evidence.connected, protocol: evidence.protocol,
      chromeTabId: evidence.chromeTabId, tabUrl: evidence.tabUrl,
      blockedRequestCount: evidence.blockedRequests.length,
      evidencePath: path.join(run.paths.artifacts, 'mv3-evidence.json'),
    };
    run.manifest.ports[0].state = 'closed';
    const final = await run.finalize(status);
    assert.equal(final.cleanup.state, 'complete', '必須清除獨立 profile/workspace/ports');
    console.log('T047_RUN_MANIFEST=' + path.join(run.root, 'owner-manifest.json'));
    console.log('T047_RUN_EVIDENCE=' + path.join(run.paths.artifacts, 'mv3-evidence.json'));
  }
});

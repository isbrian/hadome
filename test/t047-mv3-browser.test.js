'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { once } = require('node:events');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createRun } = require('../tools/lib/e2e-run');
const { auditNetLog } = require('../tools/lib/e2e-netlog-audit');

const extensionDir = path.resolve(__dirname, '../chrome-extension');
const { openBridge } = require('../src/bridge');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 這是原始 MV3 的 Browser Gate；測試頁一律由 Playwright 提供合成 HTML，禁止真實 ChatGPT/API 網路。
test('T-047：獨立 Chromium 真實載入原始 MV3，content hello 與隔離 Bridge welcome', { timeout: 45000 }, async (t) => {
  // HTTP プロキシだけでは DNS/DoH を遮断できないことを確認済み。
  // 外部のネットワーク隔離を別途検証した環境でのみ実行する。この環境変数自体は隔離の証明ではない。
  assert.equal(process.env.T047_ISOLATED_NETWORK_CONFIRMED, '1', 'BLOCKED: independently verified network isolation is required before launching Chromium');
  const run = createRun({ caseId: 'T047-MV3-BRIDGE', metadata: { layer: 'B', testDocument: 'synthetic', expectedPort: 8799 } });
  let context = null;
  let bridge = null;
  let guard = null;
  const guardSockets = new Set();
  const deniedDestinations = [];
  const guardErrors = [];
  const netLogPath = path.join(run.paths.artifacts, 'chromium-netlog.json');
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

    // 専用ブラウザーの通信を閉じ込める。プロキシは一切転送せず、8799 だけを直接接続の対象とする。
    const rejectRequest = (request) => deniedDestinations.push({ method: request.method, destination: String(request.url || '').split('?')[0].slice(0, 200) });
    guard = http.createServer((request, response) => {
      rejectRequest(request);
      response.writeHead(403, { Connection: 'close' });
      response.end();
    });
    for (const event of ['connect', 'upgrade']) guard.on(event, (request, socket) => {
      rejectRequest(request);
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    });
    // 拒否した接続をブラウザーが切断する場合も、未捕捉例外にしない。
    const recordGuardError = (source, error) => {
      guardErrors.push({ source, code: error.code || 'UNKNOWN', message: String(error.message).slice(0, 200) });
    };
    guard.on('clientError', (error, socket) => {
      recordGuardError('clientError', error);
      socket.destroy();
    });
    guard.on('connection', (socket) => {
      socket.on('error', (error) => {
        recordGuardError('socket', error);
        socket.destroy();
      });
      guardSockets.add(socket);
      socket.on('close', () => guardSockets.delete(socket));
    });
    guard.listen(0, '127.0.0.1');
    await once(guard, 'listening');
    evidence.networkGuard = { port: guard.address().port, allowedDestination: '127.0.0.1:8799', deniedDestinations, guardErrors, netLogPath };
    // Playwright は既定で Chromium sandbox を無効にするため、明示的に有効化する。
    evidence.chromiumSandboxRequested = true;
    context = await chromium.launchPersistentContext(run.paths.profile, {
      chromiumSandbox: true,
      headless: false,
      executablePath: chromium.executablePath(),
      timeout: 16000,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        `--proxy-server=http://127.0.0.1:${guard.address().port}`,
        '--proxy-bypass-list=<-loopback>;127.0.0.1:8799',
        `--log-net-log=${netLogPath}`,
        '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update',
        '--disable-sync', '--disable-default-apps',
        '--disable-features=OptimizationHints,MediaRouter',
      ],
    });

    // 合成頁不能操作真實 Chrome 權限提示；隔離 Gate 明確授權，拒絕／未授權模式需另行指定。
    evidence.loopbackGrantRequested = process.env.T047_LOOPBACK_DENY !== '1' && process.env.T047_LOOPBACK_UNGRANTED !== '1';
    if (evidence.loopbackGrantRequested) {
      await context.grantPermissions(['local-network-access'], { origin: 'https://chatgpt.com' });
    }
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
    session.on('Runtime.executionContextCreated', (event) => evidence.executionContexts.push({ contextId: event.context?.id, name: event.context?.name || '', origin: event.context?.origin || '', isDefault: !!event.context?.auxData?.isDefault }));
    await session.send('Runtime.enable');
    // T-047：只記錄隔離測試頁的 WebSocket 網路事件，不改動擴充功能的連線行為。
    evidence.cdpWebSockets = [];
    evidence.handshakeFrames = [];
    for (const [eventName, direction] of [['Network.webSocketFrameSent', 'sent'], ['Network.webSocketFrameReceived', 'received']]) {
      session.on(eventName, (event) => {
        try {
          const message = JSON.parse(event.response.payloadData);
          if (message.type === 'hello' || message.type === 'welcome') {
            evidence.handshakeFrames.push({ direction, requestId: event.requestId, type: message.type,
              protocol: message.protocol, pinnedPort: message.pinnedPort ?? null, chromeTabId: message.chromeTabId ?? null });
          }
        } catch {}
      });
    }
    const recordSocket = (phase, event) => evidence.cdpWebSockets.push({
      phase,
      requestId: event.requestId || null,
      url: event.url || (event.request && event.request.url) || null,
      errorMessage: event.errorMessage || null,
      responseStatus: event.response && event.response.status || null,
    });
    for (const [eventName, phase] of [
      ['Network.webSocketCreated', 'created'],
      ['Network.webSocketWillSendHandshakeRequest', 'handshake-request'],
      ['Network.webSocketHandshakeResponseReceived', 'handshake-response'],
      ['Network.webSocketFrameError', 'frame-error'],
      ['Network.webSocketClosed', 'closed'],
    ]) session.on(eventName, (event) => recordSocket(phase, event));
    await session.send('Network.enable');
    evidence.loopbackDenyRequested = process.env.T047_LOOPBACK_DENY === '1';
    if (evidence.loopbackDenyRequested) {
      await context.grantPermissions([], { origin: 'https://chatgpt.com' });
    }
    await page.goto('https://chatgpt.com/?bridge_port=8799', { waitUntil: 'domcontentloaded', timeout: 12000 });
    assert.equal(await page.locator('#fixture').count(), 1);
    // 僅觀察隔離 profile 的本機網路權限，不修改正式使用者設定。
    evidence.loopbackPermission = await page.evaluate(async () => {
      try {
        return (await navigator.permissions.query({ name: 'loopback-network' })).state;
      } catch (error) {
        return 'unavailable: ' + String(error).slice(0, 180);
      }
    });

    // 新 profile 第一次導覽可能早於 MV3 manifest content script 註冊完成；只在同一隔離 profile 最多導覽三次。
    evidence.navigationAttempts = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const until = Date.now() + (attempt === 3 ? 8500 : 5000);
      while (!bridge.connected() && Date.now() < until) await wait(150);
      evidence.navigationAttempts.push({ attempt, connected: bridge.connected(), isolatedWorlds: evidence.executionContexts.filter((item) => item.origin.startsWith('chrome-extension://')).length, wsAttempts: evidence.wsAttempts.length });
      if (bridge.connected()) break;
      if (attempt < 3) await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 });
    }
    // T-047 診斷：只在隔離測試失敗時檢查原始 MV3 isolated world 的 API 回應，不注入或代送 hello。
    if (!bridge.connected()) {
      evidence.isolatedProbes = [];
      for (const world of evidence.executionContexts.filter((item) => item.origin.startsWith('chrome-extension://')).slice(-3)) {
        try {
          const result = await session.send('Runtime.evaluate', {
            contextId: world.contextId,
            expression: `(async () => {
              const timeout = (ms) => new Promise(resolve => setTimeout(() => resolve({ timeout: true }), ms));
              const storage = await Promise.race([
                new Promise(resolve => { try { chrome.storage.local.get('pluginId', v => resolve({ replied: true, hasPluginId: !!(v && v.pluginId), error: chrome.runtime.lastError?.message || '' })); } catch (error) { resolve({ error: String(error) }); } }),
                timeout(1500),
              ]);
              const whoami = await Promise.race([
                new Promise(resolve => { try { chrome.runtime.sendMessage({ kind: 'whoami' }, v => resolve({ replied: true, hasTabId: Number.isInteger(v?.chromeTabId), error: chrome.runtime.lastError?.message || '' })); } catch (error) { resolve({ error: String(error) }); } }),
                timeout(1500),
              ]);
              return { storage, whoami, websocketType: typeof WebSocket };
            })()`,
            awaitPromise: true,
            returnByValue: true,
          });
          evidence.isolatedProbes.push({ contextId: world.contextId, result: result.result?.value || null,
            exception: result.exceptionDetails?.text || null });
        } catch (error) {
          evidence.isolatedProbes.push({ contextId: world.contextId, error: String(error).slice(0, 300) });
        }
      }
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
    if (evidence.loopbackDenyRequested) {
      assert.equal(evidence.loopbackPermission, 'denied', '隔離負向對照必須確實拒絕 loopback 權限');
      assert.equal(evidence.connected, false, '拒絕 loopback 權限時不應完成握手');
      assert.equal(evidence.cdpWebSockets.some((event) => event.phase === 'handshake-request'), false,
        '被拒絕的連線不得發出 WebSocket 握手請求');
      assert.ok(evidence.cdpWebSockets.some((event) => String(event.errorMessage).includes('ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS')),
        '負向對照必須觀測到 Chromium 本機網路權限阻擋錯誤');
      assert.deepEqual(evidence.handshakeFrames, [], '拒否時は hello/welcome を送受信してはならない');
      assert.ok(evidence.wsAttempts.length > 0);
      assert.ok(evidence.wsAttempts.every(url => url === 'ws://127.0.0.1:8799/'));
      assert.deepEqual(evidence.pageErrors, []);
      status = 'PASS';
      return;
    }
    assert.equal(evidence.loopbackPermission, 'granted');
    assert.equal(evidence.connected, true, '真實 MV3 content 必須送出 hello');
    assert.equal(evidence.protocol, 62);
    assert.equal(evidence.tabUrl, 'https://chatgpt.com/?bridge_port=8799');
    assert.ok(Number.isInteger(evidence.chromeTabId), '必須取得真正的 Chrome tab ID');
    assert.equal(evidence.contentStartup.pinnedValue, '8799');
    assert.equal(evidence.contentStartup.rememberedPort, '8799');
    assert.ok(Array.isArray(evidence.workerTabProbe));
    assert.equal(evidence.workerTabProbe.length, 1, '隔離 profile には専用タブだけが存在すること');
    assert.equal(evidence.workerTabProbe[0].tabId, evidence.chromeTabId);
    assert.equal(evidence.workerTabProbe[0].reportedPort, 8799);
    assert.equal(evidence.workerTabProbe[0].listenerReady, true);
    const hello = evidence.handshakeFrames.find(frame => frame.direction === 'sent' && frame.type === 'hello');
    assert.ok(hello, '実際の WebSocket hello フレームが必要');
    assert.equal(hello.pinnedPort, 8799);
    assert.equal(hello.protocol, 62);
    assert.equal(hello.chromeTabId, evidence.chromeTabId);
    assert.ok(evidence.handshakeFrames.some(frame => frame.direction === 'received' && frame.type === 'welcome' && frame.protocol === 62 && frame.requestId === hello.requestId), '同一 WebSocket の welcome が必要');
    assert.ok(evidence.cdpWebSockets.some(event => event.phase === 'handshake-response' && event.responseStatus === 101 && event.requestId === hello.requestId));
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
    if (guard) {
      for (const socket of guardSockets) socket.destroy();
      await new Promise(resolve => guard.close(resolve));
    }
    // 握手とネットワーク隔離は別々に判定する。
    evidence.handshakeStatus = status;
    let auditFailure = null;
    try {
      const netLog = JSON.parse(fs.readFileSync(netLogPath, 'utf8'));
      evidence.networkAudit = auditNetLog(netLog, ['127.0.0.1:8799', `127.0.0.1:${evidence.networkGuard.port}`]);
      if (!evidence.networkAudit.passed) auditFailure = new Error('BLOCKED: unexpected network destinations observed');
    } catch (error) {
      auditFailure = error;
      evidence.networkAudit = { passed: false, error: String(error) };
    }
    if (auditFailure && status === 'PASS') status = 'FAIL_ENVIRONMENT';
    evidence.closed = !evidence.errors.some(message => /^(browser|bridge) close:/.test(message));
    if (!evidence.closed && status === 'PASS') status = 'FAIL_ENVIRONMENT';
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
    if (evidence.handshakeStatus === 'PASS') {
      assert.equal(evidence.closed, true, 'browser/bridge cleanup must succeed');
      if (auditFailure) throw auditFailure;
    }
  }
});

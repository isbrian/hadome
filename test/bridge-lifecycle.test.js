'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CHATGPT_BRIDGE_PORTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-ports-'));

const { openBridge, EXPECTED_TAB_PROTOCOL } = require('../src/bridge');
const portlock = require('../src/portlock');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  receive(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

class FakeWebSocketServer extends EventEmitter {
  static instances = [];

  static busyPorts = new Set();

  constructor({ port } = {}) {
    super();
    this.wantedPort = Number(port || 0);
    this.serverAddress = null;
    this.closed = false;
    FakeWebSocketServer.instances.push(this);
    queueMicrotask(() => {
      if (FakeWebSocketServer.busyPorts.has(this.wantedPort)) {
        const e = new Error('address already in use');
        e.code = 'EADDRINUSE';
        this.emit('error', e);
        return;
      }
      this.serverAddress = { address: '127.0.0.1', port: this.wantedPort };
      this.emit('listening');
    });
  }

  address() {
    return this.serverAddress;
  }

  close() {
    this.closed = true;
  }

  connect(socket) {
    this.emit('connection', socket);
  }
}

function latestServer() {
  return FakeWebSocketServer.instances.at(-1);
}

function hello(socket, tabId = 'tab-a') {
  socket.receive({
    type: 'hello',
    tabId,
    protocol: 59,
    url: 'https://chatgpt.com/c/12345678',
    title: 'Fake tab',
    turns: 0,
  });
}

test('hello selects the first tab and rejects a different target', async () => {
  FakeWebSocketServer.instances = [];
  const bridge = await openBridge({
    port: 0,
    workspace: '',
    WebSocketServerImpl: FakeWebSocketServer,
  });
  const server = latestServer();
  const first = new FakeSocket();
  const second = new FakeSocket();

  server.connect(first);
  hello(first, 'tab-a');
  server.connect(second);
  hello(second, 'tab-b');

  assert.equal(first.sent.at(-1).type, 'welcome');
  assert.equal(first.sent.at(-1).protocol, EXPECTED_TAB_PROTOCOL);
  assert.deepEqual(second.sent.at(-1), { type: 'not_target' });
  assert.equal(bridge.connected(), true);
  assert.equal(bridge.tabUrl(), 'https://chatgpt.com/c/12345678');

  bridge.close();
});

test('done resolves ask and error rejects ask while cleaning the waiter', async () => {
  FakeWebSocketServer.instances = [];
  const bridge = await openBridge({
    port: 0,
    workspace: '',
    WebSocketServerImpl: FakeWebSocketServer,
  });
  const socket = new FakeSocket();
  latestServer().connect(socket);
  hello(socket);

  const answer = bridge.ask('hello');
  assert.equal(socket.sent.at(-1).type, 'send');
  socket.receive({ type: 'delta', text: 'world' });
  socket.receive({ type: 'done', text: 'world', complete: true });
  assert.equal(await answer, 'world');

  const failure = bridge.ask('again');
  socket.receive({ type: 'error', message: 'failed', status: 0 });
  await assert.rejects(failure, /failed/);

  bridge.close();
});

test('disconnect rejects an unanswered request and close is idempotent', async () => {
  FakeWebSocketServer.instances = [];
  const bridge = await openBridge({
    port: 0,
    workspace: '',
    WebSocketServerImpl: FakeWebSocketServer,
  });
  const socket = new FakeSocket();
  latestServer().connect(socket);
  hello(socket);

  const pending = bridge.ask('will disconnect');
  socket.close();
  await assert.rejects(pending);
  assert.equal(bridge.connected(), false);

  bridge.close();
  bridge.close();
});

test('塞がった枠は次の席へ回る', async () => {
  FakeWebSocketServer.instances = [];
  FakeWebSocketServer.busyPorts = new Set([8765]);
  const bridge = await openBridge({
    port: 8765,
    workspace: '',
    WebSocketServerImpl: FakeWebSocketServer,
  });

  assert.equal(bridge.port, 8766);
  assert.equal(bridge.pairUrl(), 'https://chatgpt.com/?bridge_port=8766');

  bridge.close();
  FakeWebSocketServer.busyPorts = new Set();
});

test('回る時は予約枠 8767〜8769 を飛ばす', async () => {
  FakeWebSocketServer.instances = [];
  FakeWebSocketServer.busyPorts = new Set([8765, 8766]);
  const bridge = await openBridge({
    port: 8765,
    workspace: '',
    WebSocketServerImpl: FakeWebSocketServer,
  });

  assert.equal(bridge.port, 8770);
  const tried = FakeWebSocketServer.instances.map((s) => s.wantedPort);
  for (const skipped of portlock.RESERVED) assert.equal(tried.includes(skipped), false);

  bridge.close();
  FakeWebSocketServer.busyPorts = new Set();
});

test('席が全部埋まっていたら断る', async () => {
  FakeWebSocketServer.instances = [];
  FakeWebSocketServer.busyPorts = new Set(portlock.mainPorts());
  await assert.rejects(
    openBridge({ port: 8765, workspace: '', WebSocketServerImpl: FakeWebSocketServer })
  );
  FakeWebSocketServer.busyPorts = new Set();
});

function 譲れと書く(port) {
  portlock.writeClaim(port, '別の窓');
}

test('組んだ窓は譲れと頼まれてもタブを手放さない', async () => {
  FakeWebSocketServer.instances = [];
  const bridge = await openBridge({
    port: 0,
    workspace: '',
    paired: true,
    WebSocketServerImpl: FakeWebSocketServer,
  });
  const socket = new FakeSocket();
  latestServer().connect(socket);
  hello(socket);

  譲れと書く(8790);
  await new Promise((r) => setTimeout(r, 1400));

  assert.equal(
    socket.sent.some((m) => m.type === 'handover'),
    false
  );
  assert.equal(bridge.connected(), true);

  portlock.clearClaim({ port: 8790 });
  bridge.close();
});

test('組んでいない窓は今まで通り譲る', async () => {
  FakeWebSocketServer.instances = [];
  const bridge = await openBridge({
    port: 0,
    workspace: '',
    WebSocketServerImpl: FakeWebSocketServer,
  });
  const socket = new FakeSocket();
  latestServer().connect(socket);
  hello(socket);

  譲れと書く(8791);
  await new Promise((r) => setTimeout(r, 1400));

  const 譲り = socket.sent.find((m) => m.type === 'handover');
  assert.equal(譲り && 譲り.port, 8791);

  portlock.clearClaim({ port: 8791 });
  bridge.close();
});

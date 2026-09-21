const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const LOCK_DIR = process.env.CHATGPT_BRIDGE_PORTS_DIR
  ? path.resolve(process.env.CHATGPT_BRIDGE_PORTS_DIR)
  : path.join(os.homedir(), '.chatgpt-bridge', 'ports');

const PORT_FROM = 8765;
const PORT_TO = 8771;

const RESERVED = new Set([8767, 8768, 8769]);

const SUB_BLOCK = 4;

const CDP_BASE = 9444;

function mainPorts() {
  const out = [];
  for (let p = PORT_FROM; p <= PORT_TO; p += 1) if (!RESERVED.has(p)) out.push(p);
  return out;
}

function slotIndexOf(port) {
  return mainPorts().indexOf(Number(port));
}

function subBaseFor(port, subPortBase) {
  const at = slotIndexOf(port);
  return at < 0 ? subPortBase : subPortBase + at * SUB_BLOCK;
}

function cdpFor(port) {
  const at = slotIndexOf(port);
  return at < 0 ? CDP_BASE : CDP_BASE + at;
}

function profileSuffixFor(port) {
  const at = slotIndexOf(port);
  return at > 0 ? `-${at}` : '';
}

function lockPath(port) {
  return path.join(LOCK_DIR, `${port}.json`);
}

function holderOf(port) {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pcn'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pid = /^p(\d+)$/m.exec(out);
    const name = /^c(.+)$/m.exec(out);
    if (!pid) return null;
    return { pid: Number(pid[1]), name: name ? name[1] : '' };
  } catch {

    return null;
  }
}

function readLock(port) {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(lockPath(port), 'utf8'));
  } catch {
    return null;
  }

  try {
    process.kill(info.pid, 0);
  } catch {
    try {
      fs.unlinkSync(lockPath(port));
    } catch {

    }
    return null;
  }
  return info;
}

function writeLock(port, workspace, hasTab = false) {
  try {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    fs.writeFileSync(
      lockPath(port),
      JSON.stringify({
        port,
        pid: process.pid,
        workspace: String(workspace || ''),
        hasTab: !!hasTab,
        at: Date.now(),
      })
    );
    return true;
  } catch {

    return false;
  }
}

function markTab(port, hasTab) {
  const info = readLock(port);
  if (!info || info.pid !== process.pid) return false;
  try {
    fs.writeFileSync(lockPath(port), JSON.stringify({ ...info, hasTab: !!hasTab, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function clearLock(port) {
  const info = readLock(port);
  if (info && info.pid !== process.pid) return false;
  try {
    fs.unlinkSync(lockPath(port));
    return true;
  } catch {
    return false;
  }
}

function listLocks() {
  let names;
  try {
    names = fs.readdirSync(LOCK_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    const m = /^(\d+)\.json$/.exec(n);
    if (!m) continue;
    const info = readLock(Number(m[1]));
    if (info) out.push(info);
  }
  return out.sort((a, b) => a.port - b.port);
}

const SLOTS_FILE = 'slots.json';

function slotsPath() {
  return path.join(LOCK_DIR, SLOTS_FILE);
}

function readSlots() {
  try {
    const o = JSON.parse(fs.readFileSync(slotsPath(), 'utf8'));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeSlots(map) {
  try {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    fs.writeFileSync(slotsPath(), JSON.stringify(map, null, 2));
    return true;
  } catch {

    return false;
  }
}

function heldMainPorts() {
  return listLocks().filter((l) => slotIndexOf(l.port) >= 0);
}

function leasePort(workspace) {
  const key = String(workspace || '').normalize('NFC');
  const held = heldMainPorts();
  const taken = new Set(held.map((l) => l.port));
  const free = mainPorts().filter((p) => !taken.has(p));

  const want = Number(readSlots()[key]);
  const port = free.includes(want) ? want : free[0];
  if (port === undefined) return { port: null, holders: held };
  rememberPort(key, port);
  return { port, holders: held };
}

function rememberPort(workspace, port) {
  const key = String(workspace || '').normalize('NFC');
  if (!key || slotIndexOf(port) < 0) return false;
  const map = readSlots();

  if (mainPorts().includes(Number(map[key]))) return true;
  map[key] = port;
  return writeSlots(map);
}

const CLAIM_FILE = 'claim.json';

const CLAIM_TTL_MS = 45000;

function claimPath() {
  return path.join(LOCK_DIR, CLAIM_FILE);
}

function writeClaim(port, workspace) {
  try {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    fs.writeFileSync(
      claimPath(),
      JSON.stringify({ port, pid: process.pid, workspace: String(workspace || ''), at: Date.now() })
    );
    return true;
  } catch {

    return false;
  }
}

function readClaim() {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(claimPath(), 'utf8'));
  } catch {
    return null;
  }
  const stale = !info || !info.at || Date.now() - info.at > CLAIM_TTL_MS;
  let dead = false;
  try {
    process.kill(info.pid, 0);
  } catch {
    dead = true;
  }
  if (stale || dead) {

    try {
      fs.unlinkSync(claimPath());
    } catch {

    }
    return null;
  }
  return info;
}

function clearClaim(which = {}) {
  const info = readClaim();
  if (!info) return false;
  const mine = which.pid !== undefined && info.pid === which.pid;
  const thatPort = which.port !== undefined && info.port === which.port;
  if (!mine && !thatPort) return false;
  try {
    fs.unlinkSync(claimPath());
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  markTab,
  LOCK_DIR,
  PORT_FROM,
  PORT_TO,
  RESERVED,
  SUB_BLOCK,
  CDP_BASE,
  mainPorts,
  slotIndexOf,
  subBaseFor,
  cdpFor,
  profileSuffixFor,
  slotsPath,
  heldMainPorts,
  leasePort,
  rememberPort,
  lockPath,
  holderOf,
  readLock,
  writeLock,
  clearLock,
  listLocks,
  CLAIM_TTL_MS,
  claimPath,
  writeClaim,
  readClaim,
  clearClaim,
};

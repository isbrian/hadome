const openedByPort = new Map();

function note(line) {
  const at = new Date().toISOString().slice(11, 19);
  chrome.storage.local.get({ bridgeLog: [] }, (o) => {
    const l = (o.bridgeLog || []).slice(-40);
    l.push(at + ' ' + line);
    chrome.storage.local.set({ bridgeLog: l });
  });
}

function findTabFor(port, done) {
  const kept = openedByPort.get(String(port));
  if (kept !== undefined) return done(kept);
  chrome.tabs.query({}, (tabs) => {
    void chrome.runtime.lastError;
    const hit = (tabs || []).find((t) => new RegExp('[?&]bridge_port=' + port + '\\b').test(t.url || ''));
    done(hit ? hit.id : undefined);
  });
}

const 窓の幅 = 500;
const 窓の高さ = 288;
const 横のずれ = 120;
const 縦のずれ = 48;

function 窓の場所(port) {
  const n = Number(port) % 10;
  if (!Number.isFinite(n)) return {};
  return { left: 40 + n * 横のずれ, top: 40 + n * 縦のずれ, width: 窓の幅, height: 窓の高さ };
}

function 同じ港の古いタブを閉じる(port, done) {
  if (!port) return done();
  chrome.tabs.query({}, (tabs) => {
    const queryErr = chrome.runtime.lastError;
    if (queryErr) {
      note('港 ' + port + ' の古いタブを探せません: ' + queryErr.message);
      return done();
    }
    const re = new RegExp('[?&]bridge_port=' + port + '\\b');
    const ids = (tabs || []).filter((t) => re.test(t.url || '')).map((t) => t.id).filter((id) => id !== undefined);
    if (ids.length === 0) return done();
    openedByPort.delete(String(port));
    chrome.tabs.remove(ids, () => {
      const removeErr = chrome.runtime.lastError;
      note('港 ' + port + (removeErr ? ' の古いタブを閉じられません: ' + removeErr.message : ' の古いタブを閉じました: ' + ids.length + ' 件'));
      done();
    });
  });
}

function 別の窓で開く(url, port, done) {
  chrome.windows.create({ url, focused: false, type: 'normal', ...窓の場所(port) }, (win) => {
    const err = chrome.runtime.lastError;
    if (err || !win || !win.tabs || !win.tabs[0]) {
      note('別の窓を作れません: ' + String((err && err.message) || '窓が返らない'));
      return done(null);
    }
    const tab = win.tabs[0];
    if (port) openedByPort.set(String(port), tab.id);
    note('下請けを別の窓で開きました（焦点は渡していません）');
    done(tab);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.kind === 'close_tab') {
    note('close_tab を受け取りました: 港 ' + String(msg.port || ''));

    const port = String(msg.port || '');

    const own = sender && sender.tab && sender.tab.id;
    if (own !== undefined && own !== null) {
      openedByPort.delete(port);
      chrome.tabs.remove(own, () => {
        const err = chrome.runtime.lastError;
        note('港 ' + port + (err ? ' 閉じられません: ' + err.message : ' 閉じました（頼んできたタブ）'));
      });
      return false;
    }

    findTabFor(port, (id) => {
      openedByPort.delete(port);
      if (id === undefined) {
        note('港 ' + port + ' のタブが見つかりません');
        return;
      }
      chrome.tabs.remove(id, () => {
        const err = chrome.runtime.lastError;
        note('港 ' + port + (err ? ' 閉じられません: ' + err.message : ' 閉じました'));
      });
    });
    return false;
  }
  if (!msg || msg.kind !== 'open_tab') return false;
  const url = String(msg.url || '');

  if (!/^https:\/\/chatgpt\.com\//.test(url)) {
    reply({ ok: false, why: '開けるのは chatgpt.com だけです' });
    return true;
  }
  note('open_tab を受け取りました');
  const 港 = (/[?&]bridge_port=(\d+)/.exec(url) || [])[1] || '';

  if (/\/g\/g-p-/.test(url) || /[?&]bridge_sub=1(?:&|$)/.test(url)) {
    同じ港の古いタブを閉じる(港, () => {
      別の窓で開く(url, 港, (tab) => {
        if (!tab) return reply({ ok: false, why: '別の窓を作れませんでした' });
        reply({ ok: true, tabId: tab.id });
      });
    });
    return true;
  }
  chrome.tabs.create({ url, active: false }, (tab) => {
    const err = chrome.runtime.lastError;
    if (err) return reply({ ok: false, why: String(err.message || err) });
    if (港 && tab) openedByPort.set(港, tab.id);

    reply({ ok: true, tabId: tab && tab.id });
  });
  return true;
});

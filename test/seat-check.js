// 多席位機制層驗證：真的把橋開起來，不需要 VS Code 也不需要瀏覽器。
// 用臨時鎖目錄，不碰 ~/.chatgpt-bridge/ports/。
const fs = require('fs');
const path = require('path');
const os = require('os');

const 臨時 = fs.mkdtempSync(path.join(os.tmpdir(), 'hadome-seat-'));
process.env.CHATGPT_BRIDGE_PORTS_DIR = 臨時;

const { openBridge } = require('../src/bridge');
const portlock = require('../src/portlock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const claim = () => fs.existsSync(path.join(臨時, 'claim.json'));

let 失敗 = 0;
function 判定(名, 結果, 詳細) {
  console.log(`${結果 ? '✅' : '❌'} ${名}${詳細 ? ' — ' + 詳細 : ''}`);
  if (!結果) 失敗 += 1;
}

// 席は決め打ちにしない——他の hadome が動いていても走る様に、空いている席を拾う。
function 空いている席(要る) {
  const { execFileSync } = require('child_process');
  const 出た = [];
  for (const p of portlock.mainPorts()) {
    try {
      execFileSync('lsof', ['-nP', `-iTCP:${p}`, '-sTCP:LISTEN'], { stdio: 'ignore', timeout: 3000 });
    } catch {
      出た.push(p);
      if (出た.length === 要る) break;
    }
  }
  return 出た;
}

(async () => {
  console.log('鎖目錄:', 臨時);

  const 席 = 空いている席(3);
  if (席.length < 3) {
    console.log(`\n空いている席が ${席.length} つしかありません（要る数: 3）。何も試していません。`);
    console.log('他の hadome を閉じてから、もう一度走らせてください。');

    // 0 で出ると「通った」と見分けが付かない。飛ばした事が判る様に 77 で出る。
    fs.rmSync(臨時, { recursive: true, force: true });
    process.exit(77);
  }
  const [枠A, 枠B, 枠C] = 席;
  console.log(`使う席: A=${枠A} B=${枠B} C=${枠C}\n`);

  // --- 1. 兩個配對模式的橋能同時活著 ---
  const A = await openBridge({ port: 枠A, paired: true, workspace: '/專案/A', onLog: () => {} });
  const B = await openBridge({ port: 枠B, paired: true, workspace: '/專案/B', onLog: () => {} });
  判定('兩個席位的主橋同時 listen', A.port === 枠A && B.port === 枠B, `A=${A.port} B=${B.port}`);

  const 鎖 = portlock.heldMainPorts().map((x) => x.port);
  判定('兩份鎖檔都寫出來了', 鎖.includes(枠A) && 鎖.includes(枠B), `鎖=${鎖.join(',')}`);

  const 場所 = portlock.heldMainPorts().map((x) => x.workspace);
  判定('鎖檔記錄了各自的 workspace', 場所.includes('/專案/A') && 場所.includes('/專案/B'), 場所.join(' / '));

  // --- 2. 子代理埠區塊不重疊 ---
  const a子 = [portlock.subBaseFor(枠A, 8810), portlock.subBaseFor(枠A, 8810) + 1];
  const b子 = [portlock.subBaseFor(枠B, 8810), portlock.subBaseFor(枠B, 8810) + 1];
  判定('子代理埠區塊不重疊', a子.every((p) => !b子.includes(p)), `A=${a子.join(',')} B=${b子.join(',')}`);

  // --- 3. 配對模式下，等不到分頁也不會寫 claim（不互搶的核心） ---
  判定('起始沒有 claim.json', !claim());
  const 等A = A.waitForTab(9000).catch(() => 'timeout');
  const 等B = B.waitForTab(9000).catch(() => 'timeout');
  await sleep(7000); // > CLAIM_AFTER_MS(5000)
  判定('配對模式等了 7 秒仍不寫 claim.json（不會去搶別人的分頁）', !claim());
  await Promise.all([等A, 等B]);

  // --- 4. 反面對照：非配對模式「會」寫 claim，證明上面那條不是空跑 ---
  const C = await openBridge({ port: 枠C, paired: false, workspace: '/專案/C', onLog: () => {} });
  const 等C = C.waitForTab(9000).catch(() => 'timeout');
  await sleep(7000);
  判定('反面對照：非配對模式確實會寫 claim.json', claim(), claim() ? JSON.stringify(JSON.parse(fs.readFileSync(path.join(臨時, 'claim.json'), 'utf8'))) : '沒寫');
  await 等C;

  // --- 5. 收尾 ---
  await A.close();
  await B.close();
  await C.close();
  判定('關閉後鎖檔清乾淨', portlock.heldMainPorts().length === 0, `剩 ${portlock.heldMainPorts().length} 份`);

  fs.rmSync(臨時, { recursive: true, force: true });
  console.log(`\n${失敗 === 0 ? '全部通過' : 失敗 + ' 項失敗'}`);
  process.exit(失敗 === 0 ? 0 : 1);
})().catch((e) => {
  console.error('腳本自己爆了:', e);
  process.exit(2);
});

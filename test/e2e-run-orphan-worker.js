'use strict';
// T-046 專用 fixture：父測試會強制結束本程序，再由 owner manifest 復原其子程序。
const { createRun } = require('../tools/lib/e2e-run');

(async () => {
  const run = createRun({ caseId: 'forced_termination' });
  const marker = run.paths.profile;
  const child = await run.spawnOwned(process.execPath, [
    '-e', 'setInterval(() => {}, 1000)', marker,
  ], { marker });
  process.stdout.write(JSON.stringify({ root: run.root, childPid: child.pid }) + '\n');
  setInterval(() => {}, 1000);
})().catch((error) => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});

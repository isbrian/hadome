'use strict';

const { makeSupervisor } = require('../src/supervisor');
const [root, workspace, owner] = process.argv.slice(2);

try {
  const supervisor = makeSupervisor({ root, workspace, now: () => 1000 });
  const claimed = supervisor.claim({ owner, leaseMs: 100 });
  process.stdout.write(JSON.stringify({ claimed: Boolean(claimed), id: claimed ? claimed.id : null }));
} catch (error) {
  if (/lock|busy/i.test(error.message)) {
    process.stdout.write(JSON.stringify({ claimed: false, busy: true }));
  } else {
    process.stderr.write(error.stack || String(error));
    process.exitCode = 1;
  }
}

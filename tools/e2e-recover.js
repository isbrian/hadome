#!/usr/bin/env node
'use strict';
// T-046：明確指定單一 run root；預設唯讀，--recover 才進行身分核對後清理。
const { inspectRun, recoverRun } = require('./lib/e2e-run');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== '--recover')) {
    throw new Error('使用方式：node tools/e2e-recover.js <絕對暫存 run root> [--recover]');
  }
  const result = args[1] === '--recover' ? await recoverRun(args[0]) : inspectRun(args[0]);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.cleanup.state === 'needs-manual-review') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`E2E 復原拒絕：${error.message}\n`);
  process.exitCode = 1;
});

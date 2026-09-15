const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(REPO, 'package.json');
const PACKAGE_LOCK = path.join(REPO, 'package-lock.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function nextAvailablePath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;

  const ext = path.extname(basePath);
  const stem = basePath.slice(0, -ext.length);
  let index = 1;
  let candidate;
  do {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

// 我方版本號是「上游三段 + 我方第四段」（例：0.1.18.1），但四段不是合法 semver，vsce 會擋。
// 打包期間暫時改成 0.1.18-1，產物檔名仍用四段的正式版本。
// ponytail: one-liner: split/join 轉換 | upgrade if: 版本規則不再是上游三段 + 我方序號
function toVsixVersion(version) {
  const parts = version.split('.');
  return parts.length === 4 ? `${parts.slice(0, 3).join('.')}-${parts[3]}` : version;
}

const originalPackage = readJson(PACKAGE_JSON);
const originalLock = fs.existsSync(PACKAGE_LOCK) ? readJson(PACKAGE_LOCK) : null;

const formalVersion = originalPackage.version;
const vsixVersion = toVsixVersion(formalVersion);
// 先佔好一個尚未存在的輸出路徑，交給 vsce --out，既有產物就不可能被覆蓋。
const outPath = nextAvailablePath(path.join(REPO, `${originalPackage.name}-${formalVersion}.vsix`));

try {
  writeJson(PACKAGE_JSON, { ...originalPackage, version: vsixVersion });

  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:prod'], {
    cwd: REPO,
    stdio: 'inherit',
  });

  // 每次建立 VSIX 前，同步建立最新的 Chrome Extension ZIP。
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'package:chrome'], {
    cwd: REPO,
    stdio: 'inherit',
  });

  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'vsce',
    'package',
    '--out',
    outPath,
    '--allow-missing-repository',
    '--skip-license',
    '--no-rewrite-relative-links',
  ], {
    cwd: REPO,
    stdio: 'inherit',
  });

  if (!fs.existsSync(outPath)) {
    throw new Error('找不到新產生的 VSIX 檔案。');
  }

  console.log(`VSIX 已建立：${path.basename(outPath)}`);
  console.log(`VSIX 內部版本：${vsixVersion}`);
  console.log(`正式專案版本：${formalVersion}`);
} finally {
  writeJson(PACKAGE_JSON, originalPackage);
  if (originalLock) {
    writeJson(PACKAGE_LOCK, originalLock);
  }
}

'use strict';

const { describeUsage } = require('./usage');

const THRESHOLD = 0.75;
const MUTATING_TOOLS = new Set([
  'write_file', 'edit_file', 'notebook_edit', 'run_command', 'spawn_agents',
  'enter_worktree', 'exit_worktree', 'config', 'browser_click', 'browser_set',
  'browser_type', 'browser_close', 'browser_save', 'browser_open',
]);

function decideAutoHandoff({ enabled = false, usage = null, window = 0, count = 0, max = 2, pending = 0 } = {}) {
  const detail = describeUsage(usage, window);
  let reason = '';
  if (!enabled) reason = 'disabled';
  else if (!detail.window || detail.ratio === null) reason = 'unknown-window';
  else if (count >= max || max <= 0) reason = 'limit';
  else if (pending > 0) reason = 'background-pending';
  else if (detail.ratio < THRESHOLD) reason = 'below-threshold';
  return { handoff: !reason, reason, ...detail };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function mutationFingerprint(call) {
  if (!call || !MUTATING_TOOLS.has(String(call.bridge_tool || call.tool || ''))) return '';
  const input = {};
  if (call.input && typeof call.input === 'object' && !Array.isArray(call.input)) {
    Object.assign(input, call.input);
  }
  for (const [key, value] of Object.entries(call)) {
    if (key !== 'id' && key !== 'input' && key !== 'tool' && key !== 'bridge_tool') input[key] = value;
  }
  return JSON.stringify(stable({ tool: String(call.bridge_tool || call.tool), input }));
}

function clipped(value, limit = 900) {
  const s = String(value == null ? '' : value);
  return s.length > limit ? s.slice(0, limit) + `\n…（後續 ${s.length - limit} 字未帶入，必要時重新讀取）` : s;
}

function buildHandoffMessage({ task = '', todos = [], answers = [], journal = [], lastResults = [], pending = '' } = {}) {
  const todoLines = (Array.isArray(todos) ? todos : []).map((t) =>
    `- [${String((t && t.status) || 'pending')}] ${clipped(t && t.content, 300)}`);
  const actionLines = (Array.isArray(journal) ? journal : []).slice(-16).map((r) =>
    `- ${r.ok ? '成功' : '失敗'} ${r.tool || '?'} ${r.target || ''}: ${clipped(r.output, 360)}`);
  const resultLines = (Array.isArray(lastResults) ? lastResults : []).slice(-8).map((r) =>
    `- ${r.ok ? '成功' : '失敗'} ${r.tool || '?'} ${r.target || ''}: ${clipped(r.output, 600)}`);
  const answerLines = (Array.isArray(answers) ? answers : []).slice(-3).map((a, i) =>
    `### 最近回覆 ${i + 1}\n${clipped(a, 1200)}`);
  return [
    '--- 自動上下文交接（上一段對話的執行紀錄，不是新委託）---',
    '**請直接接續原任務，不要重新從頭執行。**',
    '**已成功的寫檔、指令及外部操作不得因換對話而重做。**',
    '工具紀錄是歷史結果；如須再次變更，先重新檢查實際狀態。',
    '',
    '## 原始目標', clipped(task, 4000),
    '',
    '## 待辦清單（保留原狀態）', todoLines.join('\n') || '（尚無清單）',
    '',
    '## 最近工具執行紀錄', actionLines.join('\n') || '（尚無紀錄）',
    '',
    '## 上一回合工具結果', resultLines.join('\n') || '（尚無結果）',
    '',
    '## 尚未送出的原回合訊息', clipped(pending, 6500) || '（尚無訊息）',
    '',
    '## 最近模型回覆', answerLines.join('\n\n') || '（尚無回覆）',
    '',
    '## 接續規則',
    '先核對尚未完成的待辦，再從上一回合結束處繼續；先前完成項目不可重複認領。',
    '不確定寫入或外部動作是否已成功時，先唯讀核對，不能直接重試。',
    '--- 自動上下文交接結束 ---',
  ].join('\n');
}

module.exports = { THRESHOLD, MUTATING_TOOLS, decideAutoHandoff, mutationFingerprint, buildHandoffMessage };

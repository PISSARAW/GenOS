#!/usr/bin/env node
/* Orchestrator arm: per task, grade naive (mental) vs tooling branches,
   select winner on evidence, persist ledger. Then grade all four arms. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const runDir = __dirname;
const suiteDir = path.resolve(runDir, '../../..');
const gradersDir = path.join(suiteDir, 'graders');
const TASKS = ['t1-mod-chain', 't2-dijkstra-grid', 't3-path-count', 't4-underdetermined'];
const ARMS = ['simple', 'expert', 'genos-worker', 'genos-orchestrator'];

function grade(taskId, dir) {
  const grader = fs.readdirSync(gradersDir).find((f) => f.startsWith(taskId) && f.endsWith('.mjs'));
  const out = execFileSync(process.execPath, [path.join(gradersDir, grader), dir], { encoding: 'utf8' });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

// Orchestrator selection
const ledger = [];
for (const t of TASKS) {
  const gNaive = grade(t, path.join(runDir, 'simple', t));
  const gTool = grade(t, path.join(runDir, 'genos-worker', t));
  ledger.push({
    task: t,
    branches: {
      'fork-mental': { score: gNaive.score, passed: gNaive.passed, total: gNaive.total },
      'fork-tooling': { score: gTool.score, passed: gTool.passed, total: gTool.total },
    },
    selected: gTool.score >= gNaive.score ? 'fork-tooling' : 'fork-mental',
    reason: gTool.score > gNaive.score ? 'grader evidence favors executed branch' : 'tie; kept verified branch',
  });
}
fs.writeFileSync(path.join(runDir, 'genos-orchestrator', 'selection-evidence.json'),
  JSON.stringify({ schema_version: 1, cycle: 'ADR-0019', mode: 'mental vs tooling', tasks: ledger }, null, 2) + '\n');

// Grade all arms
function armDir(arm, taskId) {
  if (arm === 'genos-orchestrator') {
    const ev = JSON.parse(fs.readFileSync(path.join(runDir, 'genos-orchestrator', 'selection-evidence.json'), 'utf8'));
    const sel = ev.tasks.find((x) => x.task === taskId).selected;
    return path.join(runDir, sel === 'fork-naive' ? 'simple' : sel === 'fork-mental' ? 'simple' : 'genos-worker', taskId);
  }
  return path.join(runDir, arm, taskId);
}

const report = { generated_at: new Date().toISOString(), benchmark: 'execution-gap-v0', arms: {}, tasks: {} };
for (const arm of ARMS) {
  report.arms[arm] = { totalScore: 0, perfect: 0 };
  for (const t of TASKS) {
    const g = grade(t, armDir(arm, t));
    report.tasks[t] ??= {};
    report.tasks[t][arm] = { score: g.score, passed: g.passed, total: g.total };
    report.arms[arm].totalScore += g.score;
    if (g.passed === g.total) report.arms[arm].perfect += 1;
  }
  report.arms[arm].meanScore = Number((report.arms[arm].totalScore / TASKS.length).toFixed(4));
  delete report.arms[arm].totalScore;
}
report.publication_gate = {
  publishable: false,
  failed: ['one sample per arm', 'single underlying conversational model', 'mental-mode enforcement is procedural, not sandboxed'],
};
fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

console.table(TASKS.map((t) => ({ task: t, ...Object.fromEntries(ARMS.map((a) => [a, report.tasks[t][a].score])) })));
console.table(ARMS.map((a) => ({ arm: a, meanScore: report.arms[a].meanScore, perfect: report.arms[a].perfect + '/4' })));

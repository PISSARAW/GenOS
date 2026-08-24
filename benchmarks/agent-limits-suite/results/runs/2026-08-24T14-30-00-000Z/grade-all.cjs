#!/usr/bin/env node
/* Grades the four arms of this pilot and emits report.json. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const runDir = __dirname;
const suiteDir = path.resolve(runDir, '../../..');
const suite = JSON.parse(fs.readFileSync(path.join(suiteDir, 'suite.json'), 'utf8'));
const gradersDir = path.join(suiteDir, 'graders');
const ARMS = ['simple', 'expert', 'genos-worker', 'genos-orchestrator'];

function grade(taskId, dir) {
  const entry = suite.tasks.find((t) => t.id === taskId);
  const out = execFileSync(process.execPath,
    [path.join(gradersDir, path.basename(entry.grader)), dir], { encoding: 'utf8' });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

// Orchestrator arm reuses branch worlds; its answers live in simple/expert dirs.
function armDir(arm, taskId) {
  if (arm === 'genos-orchestrator') {
    const ev = JSON.parse(fs.readFileSync(path.join(runDir, 'genos-orchestrator', 'selection-evidence.json'), 'utf8'));
    const sel = ev.tasks.find((t) => t.task === taskId).selected;
    return path.join(runDir, sel === 'fork-naive' ? 'simple' : 'expert', taskId);
  }
  return path.join(runDir, arm, taskId);
}

const report = { generated_at: new Date().toISOString(), arms: {}, tasks: {} };
for (const arm of ARMS) {
  report.arms[arm] = { totalScore: 0, perfect: 0 };
  for (const t of suite.tasks) {
    const g = grade(t.id, armDir(arm, t.id));
    report.tasks[t.id] ??= {};
    report.tasks[t.id][arm] = { score: g.score, passed: g.passed, total: g.total };
    report.arms[arm].totalScore += g.score;
    if (g.passed === g.total) report.arms[arm].perfect += 1;
  }
  report.arms[arm].meanScore = Number((report.arms[arm].totalScore / suite.tasks.length).toFixed(4));
  delete report.arms[arm].totalScore;
}

report.publication_gate = {
  publishable: false,
  failed: [
    'one sample per arm',
    'single underlying conversational model (no Codex CLI available)',
    'arms differ by effort prompt and GenOS execution mechanics, not by model',
    'orchestrator arm selects between the other arms candidate pools',
  ],
};
report.notes = {
  worker_traceability: 'capsule 01a0337e-9110-7dc1-a711-f1118dc1c9b6: genome, snapshot S0, budgeted runs (one failed command recorded, one successful), S1 checkpoint',
  orchestrator_selection: 'per-task evidence in genos-orchestrator/selection-evidence.json',
};
fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

const rows = suite.tasks.map((t) => {
  const r = { task: t.id };
  for (const arm of ARMS) r[arm] = report.tasks[t.id][arm].score;
  return r;
});
console.table(rows);
console.table(Object.entries(report.arms).map(([arm, v]) => ({ arm, meanScore: v.meanScore, perfectTasks: v.perfect + '/12' })));

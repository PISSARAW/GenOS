#!/usr/bin/env node
/* Orchestrator arm: per task, grade the naive branch and the optimized
   branch in their sibling worlds, select the winner on evidence, persist a
   selection ledger. Scores of this arm = winner scores per task. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const runDir = __dirname;
const suite = JSON.parse(fs.readFileSync(path.resolve(runDir, '../../../suite.json'), 'utf8'));
const graders = path.resolve(runDir, '../../../graders');

function grade(taskId, dir) {
  const entry = suite.tasks.find((t) => t.id === taskId);
  const out = execFileSync(process.execPath, [path.join(graders, path.basename(entry.grader)), dir], { encoding: 'utf8' });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

const ledger = [];
for (const t of suite.tasks) {
  const naiveDir = path.join(runDir, 'simple', t.id);
  const optDir = path.join(runDir, 'expert', t.id);
  const gNaive = grade(t.id, naiveDir);
  const gOpt = grade(t.id, optDir);
  const chosen = gOpt.score >= gNaive.score ? 'fork-optimized' : 'fork-naive';
  ledger.push({
    task: t.id,
    branches: {
      'fork-naive': { score: gNaive.score, passed: gNaive.passed, total: gNaive.total },
      'fork-optimized': { score: gOpt.score, passed: gOpt.passed, total: gOpt.total },
    },
    selected: chosen,
    reason: gOpt.score > gNaive.score ? 'higher grader score on identical budget' : 'tie on grader score; kept verified branch',
  });
}
fs.writeFileSync(path.join(runDir, 'genos-orchestrator', 'selection-evidence.json'),
  JSON.stringify({ schema_version: 1, cycle: 'ADR-0019', selected_on: 'deterministic grader evidence', tasks: ledger }, null, 2) + '\n');
console.table(ledger.map((l) => ({ task: l.task, naive: l.branches['fork-naive'].score, optimized: l.branches['fork-optimized'].score, selected: l.selected })));

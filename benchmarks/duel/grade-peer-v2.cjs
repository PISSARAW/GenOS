#!/usr/bin/env node
/* Grade the completed peer answers on agent-limits-suite (v2 archive). */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = process.cwd();
const root = path.join(process.env.TEMP, 'peer-answers-v2');
const TASKS = ['d1-hallucinated-api', 'd1-causality', 'd1-deduction-chain', 'd2-physics-rules',
  'd2-rule-switch', 'd3-polysemy', 'd3-implicite', 'd4-long-horizon', 'd4-belief-revision',
  'd5-fragile-logistics', 'd5-grip-window', 'd6-charter-consistency'];

function grade(taskId, dir) {
  const gdir = path.join(repo, 'benchmarks/agent-limits-suite/graders');
  const graderFile = fs.readdirSync(gdir).find((f) => f.startsWith(taskId) && f.endsWith('.mjs'));
  const out = execFileSync(process.execPath, [path.join(gdir, graderFile), dir], { encoding: 'utf8' });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

const reportPath = path.join(repo, 'benchmarks/duel/cross-replication-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const rows = [];
let sum = 0;
for (const t of TASKS) {
  const dir = path.join(root, 'agent-limits-suite/tasks', t);
  const g = grade(t, dir);
  sum += g.score;
  report.suites['agent-limits-suite'][t] = { score: g.score, passed: g.passed, total: g.total };
  rows.push({ task: t, peer: g.score, passed: `${g.passed}/${g.total}`, first_failure: (g.details || []).find((x) => x.includes('KO')) || '' });
  console.log(`${t}: ${g.passed}/${g.total}`);
}
report.peer_aggregate.agent_limits_mean = Number((sum / TASKS.length).toFixed(4));
report.comparison_with_agent_a.agent_limits = {
  peer_gemini_tooling: report.peer_aggregate.agent_limits_mean,
  agentA_expert: myRef().expert,
  agentA_simple: myRef().simple,
};
function myRef() {
  const r = JSON.parse(fs.readFileSync(path.join(repo,
    'benchmarks/agent-limits-suite/results/runs/2026-08-24T14-30-00-000Z/report.json'), 'utf8'));
  return { expert: r.arms.expert.meanScore, simple: r.arms.simple.meanScore };
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.table(rows.map((r) => ({ task: r.task, score: r.peer })));
console.log('peer mean:', report.peer_aggregate.agent_limits_mean,
  '| Agent A expert:', report.comparison_with_agent_a.agent_limits.agentA_expert,
  '| simple:', report.comparison_with_agent_a.agent_limits.agentA_simple);

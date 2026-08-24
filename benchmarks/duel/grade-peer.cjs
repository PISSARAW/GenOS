#!/usr/bin/env node
/* Cross-replication grading: peer answers vs Agent A's published runs. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = process.cwd();
const peerRoot = path.join(process.env.TEMP, 'peer-answers');
const graders = (rel) => path.join(repo, 'benchmarks', rel.split('/')[0], 'graders', path.basename(rel));

const SUITES = {
  'execution-gap-suite': ['t1-mod-chain', 't2-dijkstra-grid', 't3-path-count', 't4-underdetermined'],
  'agent-limits-suite': ['d1-hallucinated-api', 'd1-causality', 'd1-deduction-chain', 'd2-physics-rules',
    'd2-rule-switch', 'd3-polysemy', 'd3-implicite', 'd4-long-horizon', 'd4-belief-revision',
    'd5-fragile-logistics', 'd5-grip-window', 'd6-charter-consistency'],
};

function grade(suite, taskId, dir) {
  const graderFile = fs.readdirSync(path.join(repo, 'benchmarks', suite, 'graders'))
    .find((f) => f.startsWith(taskId) && f.endsWith('.mjs'));
  const out = execFileSync(process.execPath, [path.join(repo, 'benchmarks', suite, 'graders', graderFile), dir],
    { encoding: 'utf8' });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

// Agent A's own published arm scores (run 2026-08-24T14-30-00-000Z)
const myRun = JSON.parse(fs.readFileSync(
  path.join(repo, 'benchmarks/agent-limits-suite/results/runs/2026-08-24T14-30-00-000Z/report.json'), 'utf8'));
const myGap = JSON.parse(fs.readFileSync(
  path.join(repo, 'benchmarks/execution-gap-suite/results/runs/2026-08-24T16-00-00-000Z/report.json'), 'utf8'));

const report = { generated_at: new Date().toISOString(), peer_model: 'Gemini 3.1 Pro (tooling mode)', suites: {} };
for (const [suite, tasks] of Object.entries(SUITES)) {
  report.suites[suite] = {};
  for (const t of tasks) {
    const g = grade(suite, t, path.join(peerRoot, suite, 'tasks', t));
    report.suites[suite][t] = { score: g.score, passed: g.passed, total: g.total };
    console.log(`${suite}/${t}: ${g.passed}/${g.total}`);
  }
}

// Aggregates + comparison
report.peer_aggregate = {
  execution_gap_mean: Number((Object.entries(report.suites['execution-gap-suite']).reduce((s, [, v]) => s + v.score, 0) / 4).toFixed(4)),
  agent_limits_mean: Number((Object.entries(report.suites['agent-limits-suite']).reduce((s, [, v]) => s + v.score, 0) / 12).toFixed(4)),
};
report.comparison_with_agent_a = {
  note: 'Agent A values are its published tooling/worker arms and expert/simple arms on identical tasks.',
  execution_gap: {
    peer_gemini_tooling: report.peer_aggregate.execution_gap_mean,
    agentA_genos_worker: myGap.arms['genos-worker'].meanScore,
    agentA_expert_mental: myGap.arms.expert.meanScore,
    agentA_simple_mental: myGap.arms.simple.meanScore,
  },
  agent_limits: {
    peer_gemini: report.peer_aggregate.agent_limits_mean,
    agentA_expert: myRun.arms.expert.meanScore,
    agentA_simple: myRun.arms.simple.meanScore,
  },
};
fs.writeFileSync(path.join(repo, 'benchmarks/duel/cross-replication-report.json'),
  JSON.stringify(report, null, 2) + '\n');
console.log('\npeer aggregate:', JSON.stringify(report.peer_aggregate));
console.log('comparison:', JSON.stringify(report.comparison_with_agent_a, null, 2));

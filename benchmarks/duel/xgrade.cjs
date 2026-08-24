#!/usr/bin/env node
/* Authoritative cross-grading: pristine instances + peer answers overlaid. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = process.cwd();
const peerRoot = path.join(process.env.TEMP, 'peer-answers-v2');
const TASKS = ['d1-hallucinated-api', 'd1-causality', 'd1-deduction-chain', 'd2-physics-rules',
  'd2-rule-switch', 'd3-polysemy', 'd3-implicite', 'd4-long-horizon', 'd4-belief-revision',
  'd5-fragile-logistics', 'd5-grip-window', 'd6-charter-consistency'];

function findPeerTaskDir(taskId) {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name === taskId) hits.push(p); else walk(p); }
    }
  };
  walk(peerRoot);
  return hits[0];
}

const rows = [];
let sum = 0;
for (const t of TASKS) {
  // 1. pristine instance from the committed suite
  const work = path.join(process.env.TEMP, 'xgrade', t);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(work), { recursive: true });
  fs.cpSync(path.join(repo, 'benchmarks/agent-limits-suite/tasks', t), work, { recursive: true });
  // 2. overlay ONLY peer answers/
  const peerDir = findPeerTaskDir(t);
  const pa = path.join(peerDir, 'answers');
  if (fs.existsSync(pa)) {
    for (const f of fs.readdirSync(pa)) fs.cpSync(path.join(pa, f), path.join(work, 'answers', f), { force: true });
  } else {
    console.log(`${t}: PEER PROVIDED NO answers/ DIRECTORY`);
  }
  // 3. grade pristine+overlay
  const gdir = path.join(repo, 'benchmarks/agent-limits-suite/graders');
  const graderFile = fs.readdirSync(gdir).find((f) => f.startsWith(t) && f.endsWith('.mjs'));
  const out = execFileSync(process.execPath, [path.join(gdir, graderFile), work], { encoding: 'utf8' });
  const g = JSON.parse(out.trim().split(/\r?\n/).pop());
  sum += g.score;
  rows.push({ task: t, score: g.score, passed: g.passed, total: g.total,
    detail: (g.details || []).filter((x) => x.includes('KO')).join(' | ') || 'all OK' });
}
console.table(rows.map((r) => ({ task: r.task, score: r.score, passed: r.passed })));
for (const r of rows) if (r.score < 1) console.log(`${r.task}: ${r.detail}`);
console.log('PEER MEAN:', Number((sum / TASKS.length).toFixed(4)));

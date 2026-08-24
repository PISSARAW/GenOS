#!/usr/bin/env node
/* Self-check: golden answers must pass, empty answers must fail. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const suite = path.resolve(__dirname);
const tasks = fs.readdirSync(path.join(suite, 'tasks'));
let bad = 0;
for (const t of tasks) {
  const tmp = path.join(process.env.TEMP, `egap-${t}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.cpSync(path.join(suite, 'tasks', t), tmp, { recursive: true });
  const golden = path.join(suite, 'graders', 'golden', t, 'answers');
  if (!fs.existsSync(golden)) { console.log(t, 'NO_GOLDEN'); bad++; continue; }
  fs.cpSync(golden, path.join(tmp, 'answers'), { recursive: true });
  const grader = fs.readdirSync(path.join(suite, 'graders')).find((f) => f.startsWith(t) && f.endsWith('.mjs'));
  const run = () => JSON.parse(execFileSync(process.execPath,
    [path.join(suite, 'graders', grader), tmp], { encoding: 'utf8' }).trim().split(/\r?\n/).pop());
  const pos = run();
  fs.rmSync(path.join(tmp, 'answers'), { recursive: true, force: true });
  const neg = run();
  const okPos = pos.passed === pos.total;
  const okNeg = neg.failed > 0 || neg.score === 0;
  if (!okPos || !okNeg) bad++;
  console.log(`${t}: positive ${pos.passed}/${pos.total} | negative ${okNeg ? 'ok' : 'LEAK'}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exitCode = bad ? 1 : 0;

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('./expression.cjs');
const { runIsolated } = require('../../../backend/src/services/sandboxExecutor');
const { runTestAdapter } = require('../../../backend/src/services/epistemic/verifierAdapters');

async function check(task, candidate, context) {
  const directory = path.join(context.root, context.branchId);
  fs.mkdirSync(directory, { recursive: true });
  try { compile(candidate.expression); }
  catch (error) { return { passed: false, status: 'refuted', feedback: error.message, executions: [] }; }
  for (const filename of ['expression.cjs', 'code-worker.cjs']) fs.copyFileSync(path.join(__dirname, filename), path.join(directory, filename));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ scripts: { test: 'node code-worker.cjs candidate.json' } }));
  fs.writeFileSync(path.join(directory, 'candidate.json'), JSON.stringify({ expression: candidate.expression, tests: task.visibleTests }));
  fs.writeFileSync(path.join(directory, 'patch.js'), `function solve(a,b,c) { return (${candidate.expression}); }\n`);
  if (context.genos) {
    const result = await runTestAdapter({ claim: task.description },
      { type: 'test', test: { command: 'npm test', cwd: directory } },
      { allowedWorkspaceRoot: context.root, timeoutMs: context.timeoutMs });
    return { passed: result.status === 'verified', status: result.status,
      feedback: result.observations.map(row => row.detail?.stdout || row.detail?.note || '').join('\n').slice(-1500),
      executions: result.observations, counterexamples: result.counterexamples };
  }
  const result = await runIsolated({ command: 'npm test', cwd: directory, timeoutMs: context.timeoutMs });
  return { passed: result.success, status: result.timedOut ? 'inconclusive' : result.success ? 'verified' : 'refuted',
    feedback: result.stdout.slice(-1500), executions: [result] };
}

module.exports = { check };


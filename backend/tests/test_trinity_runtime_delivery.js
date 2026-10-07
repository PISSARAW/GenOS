'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAgentRuntimePrompt } = require('../bin/agent-runtime-prompt.cjs');
const { writeArtifacts } = require('../src/services/localArtifactWriter');
const kinds = require('../src/services/agents/workerKindService');

const mission = { prompt: 'Preserve the full mission: primes17,21,29,33,37.', workspaceRoot: 'isolated-root' };
mission.workerContract = kinds.buildWorkerContract('bounded_worker', { scope: 'test-scope' });
const prompt = buildAgentRuntimePrompt({ mission, isWorker: true, toolLease: [],
  strategyContract: {}, runtimeContract: {}, autonomyPlan: {}, runtimeAutonomyPlan: {}, executionPolicy: {} });
assert.ok(prompt.includes(mission.prompt));
assert.ok(prompt.includes('scopeCompletion'));
assert.ok(prompt.includes('[WORKSPACE] Root: isolated-root'));
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trinity-delivery-'));
try {
  const reply = JSON.stringify({ artifactText: '[ARTIFACT: answer.json]{"primes":[17,29,37]}[/ARTIFACT]' });
  writeArtifacts(reply, { workspaceRoot, allowFileEdits: false });
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'answer.json')), false);
  writeArtifacts(reply, { workspaceRoot, allowFileEdits: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'answer.json'))), { primes: [17,29,37] });
  assert.throws(() => writeArtifacts('[ARTIFACT: ../escape.json]{}[/ARTIFACT]', { workspaceRoot, allowFileEdits: true }), /escapes/);
} finally { fs.rmSync(workspaceRoot, { recursive: true, force: true }); }
console.log('Trinity mission, worker schema and confined JSON artifact delivery: PASS');

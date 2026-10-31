'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const mode = process.argv[3];
const checkpoint = require('../../src/services/localRuntimeCheckpoint');
checkpoint.save = async () => {};
require('../../src/services/localRuntimeCaptureBarrier').safePoint = async () => {};
require('../../src/services/localRuntimeReconnectLifecycle').close = async () => {};
require('../../src/services/subprocessModelBudgetRoute').close = async () => {};

fs.writeFileSync(path.join(root, 'test-probe.cjs'), `process.exitCode=${mode === 'fail' ? 1 : 0};`);
const reply = { outcome: mode === 'declared-failure' ? 'failed' : 'success',
  claims: [{ statement: 'Analyse du composant effectuée.', evidence: ['mission'] }],
  scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] }, tests: ['node test-probe.cjs'] };
if (mode === 'invalid') reply.claims = [];
const state = { mission: { agentId: 'probe-worker', missionId: 'probe-mission', executionMode: 'worker', workerKind: 'bounded_worker' },
  workspaceRoot: root, agentName: 'regression', executionPolicy: {
    allowedCommands: mode === 'denied' ? [] : ['node test-probe.cjs'] },
  executionBudget: { tokens: 10000, events: 100 }, promptTokenEstimate: 10, eventCount: 0,
  allowFileEdits: false, resumeCheckpoint: { phase: 'generated', reply: JSON.stringify(reply) } };
const record = () => fs.writeFileSync(path.join(root, 'success-memory'), 'compiled');
require('../../bin/local-codex-runtime.cjs').runMission(state, {
  strategyExecutionAdapter: { executePipelineWithFeedback: async () => { record(); } },
  agentMemory: { compileExecutionMemory: async () => { record(); } }
}).catch(error => { console.error(error); process.exitCode = 2; });

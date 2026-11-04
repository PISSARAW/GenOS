'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const context = require('../bin/orchestratorMissionRuntimeContext.cjs');
const lease = require('../src/services/agentRuntimeAdapter/missionLease');
const limits = require('../src/services/workerInferenceLimits');

const request = { localModel: 'ollama://pinned-local-model',
  localRoutingPolicy: { primary: 'ollama://pinned-local-model', fallbacks: [], parallelReview: [] },
  executionPolicy: { inferenceLimits: { attempts: 1, outputTokens: 2048 } } };
const mission = { ...context(request), executionPolicy: limits.policyFields(request) };
assert.equal(mission.localModel, request.localModel);
assert.deepEqual(mission.localRoutingPolicy, request.localRoutingPolicy);
assert.deepEqual(limits.resolve(mission), request.executionPolicy.inferenceLimits);
assert.equal(Boolean(lease.isInProcessWorker({ execution_mode: 'orchestrator' }, mission, 'local-codex-runtime.cjs')), false,
  'A pinned local model must not make an orchestrator skip its worker evidence barrier.');
assert.equal(Boolean(lease.isInProcessWorker({ execution_mode: 'worker' }, mission, 'local-codex-runtime.cjs')), true);
const policy = require('../bin/orchestratorLocalExecutionPolicy.cjs');
assert.equal(policy.requiresWorkerBarrier({topologyId: 'trinity'}, {dispatchWorkers: []}), true,
  'An empty preliminary plan cannot downgrade the explicit topology to a local monoworker.');
assert.equal(policy.requiresWorkerBarrier({worker_roster: {agent_count: 3}}, {dispatchWorkers: []}), true);
assert.equal(policy.requiresWorkerBarrier({}, {dispatchWorkers: [{role: 'one'}]}), false);
assert.equal(policy.requiresWorkerBarrier({}, {dispatchWorkers: [{role: 'one'}, {role: 'two'}]}), true);
const preflight = require('../bin/orchestratorMcpPreflight.cjs');
assert.deepEqual(preflight.baselineTools({phases: []}), []);
assert.deepEqual(preflight.baselineTools({phases: []}, {hypotheses: [{statement: 'Falsifiable'}]}), ['genos_diagnose']);
console.log('Pinned model and inference limits survive the CLI; local orchestrators still execute the worker barrier: PASS');

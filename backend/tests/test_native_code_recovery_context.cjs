'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fleet = require('../src/services/agentFleetWorkers');
const failures = require('../src/services/workerFailureRecoveryService');
const recovery = require('../src/services/agentRecovery/recoveryMissionBinding');
const local = require('../src/services/workerEvidenceLocalPrompt');
const objective = 'Repair reconciler.cjs while preserving atomic rollback and idempotent retries.';
const parent = {prompt: objective, localCodeWorker: true, executor: 'local'};
const runtime = fleet.workerRuntime({parent: {}, route: {}, mission: parent, assignment: {workerKind: 'adaptive_worker'}});
const mission = {...runtime, prompt: 'Identity and genome context. '.repeat(300) + objective,
  workerAssignment: {topologyRole: 'implementation'}, workerKind: 'adaptive_worker'};
const report = failures.failureReport({eventType: 'AGENT_FAILED', detail: 'Public test failed.'}, mission);
assert.equal(report.mission, objective, 'Recovery must retain the canonical goal before decorated prompt truncation');
const role = recovery.resolveRecoveryRole({mission, source: {role: 'implementation'}, decision: {role: 'verifier'}});
assert.equal(role, 'implementation');
assert.equal(local.isCodeWorkerMission({...mission, role}), true);
assert.equal(local.isCodeWorkerMission({localCodeWorker: true, workerKind: 'scout', role: 'environment_mapper'}), false);
assert.equal(fleet.workerRuntime({parent: {}, route: {}, mission: {...parent, originalMission: 'Canonical original'}, assignment: {}}).originalMission,
  'Canonical original');
console.log('Native code recovery: canonical goal survives identity context; topology role preserves code mode; scout remains read-only: PASS');

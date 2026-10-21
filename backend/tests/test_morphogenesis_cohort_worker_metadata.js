'use strict';

const assert = require('node:assert/strict');
const { reuseCohortWorker } = require('../src/services/agentCohortWorkerService');

const existing = {
  agentId: 'cohort-worker-1', name: 'Worker', role: 'reviewer', status: 'idle',
  runtime_pid: null, parent_agent_id: 'orchestrator-1', execution_mode: 'worker',
  leased: 0, metadata_json: '{invalid', workspace_id: 'workspace-1', workspaceRoot: 'C:/workspace'
};
const assignment = { role: 'reviewer', workerKind: 'verifier_worker' };

assert.throws(() => reuseCohortWorker(existing, {
  parentId: 'orchestrator-1', assignment, tokenBudget: 100,
  mission: { executionBudget: { tokens: 100 } }
}), { code: 'INVALID_SUBORCHESTRATOR_CONTRACT' });

console.log('Morphogenesis cohort reuse rejects corrupt persisted worker metadata.');

'use strict';

const assert = require('node:assert/strict');
const { buildOrchestratorPreflightInput, prepareToolArguments } = require('../bin/orchestratorMcpPreflight.cjs');
const missionRuntimeContext = require('../bin/orchestratorMissionRuntimeContext.cjs');

const db = {};
const request = { workspaceRoot: 'D:/isolated-site', preflightSnapshotAgent: 'arch_agent.json',
  diagnosticHypotheses: [{ statement: 'Compare actual user-facing behavior to the written mandate.' }] };
const built = buildOrchestratorPreflightInput({ db, orchestratorId: 'agent-1', missionId: 'mission-1',
  task: 'Maintain isolated site', repoRoot: 'D:/GenOS', request, tools: ['genos_diagnose'] });
assert.equal(built.db, db);
assert.equal(built.orchestratorId, 'agent-1');
assert.equal(built.missionId, 'mission-1');
assert.equal(built.workspaceRoot, 'D:/isolated-site');
assert.equal(built.snapshotAgent, 'arch_agent.json');
assert.deepEqual(built.hypotheses, request.diagnosticHypotheses);
assert.deepEqual(built.tools, ['genos_diagnose']);
const decision = prepareToolArguments({ task: 'Maintain site', orchestratorId: 'agent-1' }, 'genos_record_decision', [
  { tool: 'genos_search_failures', status: 'completed', resultDigest: 'search-digest' },
  { tool: 'genos_snapshot', status: 'completed', resultDigest: 'snapshot-digest' }
]);
assert.deepEqual(decision.args.evidence, ['mcp:genos_search_failures:search-digest', 'mcp:genos_snapshot:snapshot-digest']);
assert.equal(decision.args.agentId, 'agent-1');
assert.equal(missionRuntimeContext({ communication_required: true }).communicationRequired, true);
console.log('Orchestrator preflight forwards falsifiable hypotheses and the bound D: workspace.');

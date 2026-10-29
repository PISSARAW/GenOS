'use strict';

const assert = require('node:assert/strict');
const { observeGenosTools } = require('../../bin/agent-runtime-events.cjs');
const { assertSuccessfulTool, assertPreflightContext,
  preflightEnvironment, prepareToolArguments, PREFLIGHT_TOOLS } = require('../../bin/orchestratorMcpPreflight.cjs');
const { encodeMission, decodeMissionInput } = require('../../src/services/runtimeProtocol');

const state = {
  requiredTools: new Set(['genos_snapshot', 'genos_search_failures']),
  observedTools: new Set()
};

observeGenosTools(state, { type: 'item.completed', item: {
  type: 'agent_message', text: 'I called genos_snapshot and genos_search_failures.'
} });
assert.deepEqual([...state.observedTools], [], 'assistant text must not count as tool execution');

observeGenosTools(state, { type: 'item.started', item: {
  type: 'mcp_tool_call', name: 'genos_snapshot'
} });
assert.deepEqual([...state.observedTools], [], 'a started call is not yet completed evidence');

observeGenosTools(state, { type: 'item.completed', item: {
  type: 'mcp_tool_call', name: 'genos_snapshot', status: 'failed'
} });
assert.deepEqual([...state.observedTools], [], 'a failed MCP call must not satisfy the invariant');

observeGenosTools(state, { type: 'item.completed', item: {
  type: 'mcp_tool_call', name: 'genos_snapshot', status: 'completed'
} });
observeGenosTools(state, { type: 'item.completed', item: {
  type: 'mcp_tool_call', name: 'genos_search_failures', status: 'completed'
} });
assert.deepEqual([...state.observedTools].sort(), ['genos_search_failures', 'genos_snapshot']);
assert.throws(() => assertSuccessfulTool('genos_snapshot', { isError: true,
  content: [{ type: 'text', text: 'snapshot rejected' }] }), error => error.code === 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED');
assert.throws(() => assertSuccessfulTool('genos_search_failures', { content: [{ type: 'text',
  text: JSON.stringify({ success: false, error: 'lease denied' }) }] }),
error => error.code === 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED');
assert.throws(() => assertSuccessfulTool('genos_search_failures', { content: [{ type: 'text',
  text: JSON.stringify({ failures: [] }) }] }),
error => error.code === 'ORCHESTRATOR_PREFLIGHT_TOOL_FAILED');
assert.doesNotThrow(() => assertSuccessfulTool('genos_search_failures', { content: [{ type: 'text',
  text: JSON.stringify({ success: true, failures: [] }) }] }));
assert.throws(() => assertPreflightContext({ tools: [] }),
  error => error.code === 'ORCHESTRATOR_PREFLIGHT_CONTEXT_INVALID');
const environment = preflightEnvironment({ repoRoot: 'repo-root', workspaceRoot: 'workspace-root' },
  ['genos_snapshot']);
assert.equal(environment.GENOS_REPO_ROOT, 'repo-root');
assert.equal(environment.GENOS_WORKSPACE_ROOT, 'workspace-root');
assert.equal(environment.GENOS_AGENT_ID, undefined, 'missing agent identity remains unavailable in unit fixtures');
const previousOrchestrator = process.env.GENOS_ORCHESTRATOR_AGENT_ID;
process.env.GENOS_ORCHESTRATOR_AGENT_ID = 'stale-parent';
const boundEnvironment = preflightEnvironment({ repoRoot: 'repo-root', workspaceRoot: 'workspace-root',
  orchestratorId: 'current-root' }, ['genos_snapshot']);
if (previousOrchestrator === undefined) delete process.env.GENOS_ORCHESTRATOR_AGENT_ID;
else process.env.GENOS_ORCHESTRATOR_AGENT_ID = previousOrchestrator;
assert.equal(boundEnvironment.GENOS_AGENT_ID, 'current-root');
assert.equal(boundEnvironment.GENOS_ORCHESTRATOR_AGENT_ID, 'current-root',
  'preflight identity must not inherit a stale parent orchestrator');
assert(PREFLIGHT_TOOLS.has('genos_diagnose'));
assert.deepEqual(prepareToolArguments({ task: 'delivery recovery', hypotheses: [{
  statement: 'A restart omits messages beyond the checkpoint.'
}] }, 'genos_diagnose').args.hypotheses, [{
  statement: 'A restart omits messages beyond the checkpoint.'
}]);
const generatedDiagnosis = prepareToolArguments({ task: 'delivery recovery' }, 'genos_diagnose');
assert.equal(generatedDiagnosis.args.hypotheses.length, 1,
  'an absent hypothesis list must produce a falsifiable fallback hypothesis');
assert.match(generatedDiagnosis.args.hypotheses[0].statement, /authorized workspace/);
assert.match(generatedDiagnosis.args.hypotheses[0].statement, /delivery recovery/);

const missionFrame = encodeMission({ agentId: 'orchestrator', missionId: 'mission-preflight-binding', prompt: 'synthesize' });
assert.equal(decodeMissionInput(missionFrame).missionId, 'mission-preflight-binding',
  'the protobuf runtime envelope must preserve mission identity for preflight receipt checks');

process.stdout.write('Structured successful MCP calls satisfy required-tool observation; text and failed calls do not.\n');

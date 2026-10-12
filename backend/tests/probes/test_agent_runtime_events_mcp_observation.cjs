'use strict';

const assert = require('node:assert/strict');
const { observeGenosTools } = require('../../bin/agent-runtime-events.cjs');
const { assertSuccessfulTool } = require('../../bin/orchestratorMcpPreflight.cjs');
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

const missionFrame = encodeMission({ agentId: 'orchestrator', missionId: 'mission-preflight-binding', prompt: 'synthesize' });
assert.equal(decodeMissionInput(missionFrame).missionId, 'mission-preflight-binding',
  'the protobuf runtime envelope must preserve mission identity for preflight receipt checks');

process.stdout.write('Structured successful MCP calls satisfy required-tool observation; text and failed calls do not.\n');

'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { tools } = require('../../shared/toolDefinitions.json');
const nodeTools = require('../../mcp/toolDefinitions.json').tools;
const { validateToolArguments, REQUIRED_STRINGS } = require('../src/services/mcpArgumentValidation');

const ajv = new Ajv({ strict: false });
for (const tool of tools) {
  ajv.compile(tool.inputSchema);
  for (const field of REQUIRED_STRINGS[tool.name] || []) {
    assert.equal(tool.inputSchema.properties?.[field]?.type, 'string',
      `${tool.name}.${field} must be a string in the public schema`);
  }
}

for (const name of ['genos_orchestrate', 'genos_topology_session', 'genos_diagnose']) {
  const canonical = tools.find((tool) => tool.name === name);
  const node = nodeTools.find((tool) => tool.name === name);
  assert.deepEqual(node.inputSchema, canonical.inputSchema, `${name} catalog parity`);
}
const diagnosisSchema = tools.find((tool) => tool.name === 'genos_diagnose').inputSchema;
assert.deepEqual(diagnosisSchema.properties.hypotheses.items.required, ['statement']);
const orchestrate = tools.find((tool) => tool.name === 'genos_orchestrate');
for (const field of ['topologyId', 'variantId']) {
  assert.equal(orchestrate.inputSchema.properties[field].type, 'string');
  assert.match(orchestrate.inputSchema.properties[field].description, /does not apply a morphogenesis transition/);
}
assert.ok(tools.find((tool) => tool.name === 'genos_topology_session')
  .inputSchema.properties.operation.enum.includes('materialize'));

const accepted = [
  ['genos_orchestrate', { mission: 'inspect', workspaceId: 'ws-project',
    workspaceScopeId: 'ws-tenant', workspaceRoot: 'C:/worktree/GenOS' }],
  ['genos_diagnose', { task: 'find-cause', hypotheses: [{ statement: 'a falsifiable claim' }] }],
  ['genos_analyze_trajectory', { actionHistory: [{ action: 'test' }] }],
  ['genos_record_decision', { agentId: 'agent', title: 'Keep explicit leases',
    decision: 'Retain denial outside the profile', evidence: ['test'] }],
  ['genos_worker_publish', { kind: 'evidence', signal_type: 'ligand', signal_data: { intensity: 1 }, in_reply_to: 1 }],
  ['genos_worker_inbox', { acknowledge_message_ids: [1, 2] }],
  ['genos_a_team_preview', { project_goal: 'build', sub_systems: ['backend'] }],
  ['genos_biological_mode', { mode: 'biome', mission: 'inspect' }],
  ['genos_signal_collective_decision', { mode: 'stigmergic', problem: 'choice', voters: [] }],
  ['genos_snapshot', { agent: 'agent.json', out: 'snapshot.json' }],
  ['genos_orchestrate', { mission: 'evaluate', topologyId: 'syncytium', variantId: 'soft' }]
];
for (const [name, args] of accepted) {
  assert.equal(validateToolArguments(name, args), null, `${name} must accept its public schema`);
}

const rejected = [
  ['genos_snapshot', {}],
  ['genos_snapshot', { agent: '', out: 'snapshot.json' }],
  ['genos_diagnose', { task: 'find-cause', hypotheses: 'not-an-array' }],
  ['genos_diagnose', { task: 'find-cause', hypotheses: [{ claim: 'legacy field' }] }],
  ['genos_diagnose', { task: 'find-cause', hypotheses: [{ statement: '' }] }],
  ['genos_analyze_trajectory', { actionHistory: [] }],
  ['genos_record_decision', { agentId: 'agent', title: 'choice', decision: 'keep', evidence: [] }],
  ['genos_worker_publish', { kind: 'status', signal_type: 'ligand', signal_data: [] }],
  ['genos_worker_publish', { kind: 'status', signal_type: 'ligand', signal_data: { intensity: 1 } }],
  ['genos_worker_inbox', { acknowledge_message_ids: [0] }],
  ['genos_a_team_preview', { project_goal: 'build', sub_systems: 4 }]
];
for (const [name, args] of rejected) {
  assert.equal(validateToolArguments(name, args)?.code, 'INVALID_TOOL_ARGUMENTS', name);
}

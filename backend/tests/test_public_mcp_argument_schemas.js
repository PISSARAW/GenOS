'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { tools } = require('../../shared/toolDefinitions.json');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');

const ajv = new Ajv({ strict: false });
for (const tool of tools) ajv.compile(tool.inputSchema);

const accepted = [
  ['genos_diagnose', { task: 'find-cause', hypotheses: [{ claim: 'a' }] }],
  ['genos_analyze_trajectory', { actionHistory: [{ action: 'test' }] }],
  ['genos_record_decision', { agentId: 'agent', title: 'choice', decision: 'keep', evidence: ['test'] }],
  ['genos_worker_publish', { kind: 'status', signal_type: 'ligand', signal_data: { intensity: 1 } }],
  ['genos_a_team_preview', { project_goal: 'build', sub_systems: ['backend'] }],
  ['genos_snapshot', { agent: 'agent.json', out: 'snapshot.json' }]
];
for (const [name, args] of accepted) {
  assert.equal(validateToolArguments(name, args), null, `${name} must accept its public schema`);
}

const rejected = [
  ['genos_snapshot', {}],
  ['genos_snapshot', { agent: '', out: 'snapshot.json' }],
  ['genos_diagnose', { task: 'find-cause', hypotheses: 'not-an-array' }],
  ['genos_analyze_trajectory', { actionHistory: [] }],
  ['genos_record_decision', { agentId: 'agent', title: 'choice', decision: 'keep', evidence: [] }],
  ['genos_worker_publish', { kind: 'status', signal_type: 'ligand', signal_data: [] }],
  ['genos_a_team_preview', { project_goal: 'build', sub_systems: 4 }]
];
for (const [name, args] of rejected) {
  assert.equal(validateToolArguments(name, args)?.code, 'INVALID_TOOL_ARGUMENTS', name);
}

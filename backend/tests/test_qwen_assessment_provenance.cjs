'use strict';
const assert = require('node:assert/strict');
const { assess } = require('../../benchmarks/qwen-worker-missions/assess.cjs');
const { cliReceipt } = require('../../benchmarks/qwen-worker-missions/evidence-scope.cjs');
function fixture() {
  return { cli: { workerId: 'worker', orchestratorId: 'parent' }, expectedModel: 'ollama://qwen-test',
    agents: [{ id: 'worker', parent_agent_id: 'parent', execution_mode: 'worker' }],
    missions: [{ mission_id: 'mission', orchestrator_agent_id: 'parent' }], members: [{ mission_id: 'mission', agent_id: 'worker' }],
    bindings: [{ run_id: 'run', mission_id: 'mission', agent_id: 'worker' }],
    runs: [{ id: 'run', agent_id: 'worker', status: 'completed', metrics_json: '{"tokens":12}' }],
    events: [{ type: 'AGENT_COMPLETED', agentId: 'worker', run: 'run', model: 'ollama://qwen-test', provider: 'ollama', usage: { tokens: 12 },
      report: { outcome: 'success', claims: [{ statement: '{"count":7,"sum":210,"mean":30,"median":30,"maximum":60}', evidence: ['mission'] }] } }] };
}
assert.equal(assess('02', fixture()).status, 'passed');
const missing = fixture(); delete missing.cli;
assert.equal(assess('02', missing).status, 'unmeasured');
const wrongModel = fixture(); wrongModel.events[0].model = 'ollama://qwen-other';
assert.equal(assess('02', wrongModel).status, 'unmeasured');
const wrongMission = fixture(); wrongMission.bindings[0].mission_id = 'other';
assert.equal(assess('02', wrongMission).status, 'unmeasured');
const sibling = fixture(); sibling.events[0].report.claims[0].statement = '{"count":7,"sum":250,"mean":30,"median":30,"maximum":60}';
sibling.events.push({ ...fixture().events[0], agentId: 'sibling', run: 'sibling-run' });
sibling.runs.push({ id: 'sibling-run', agent_id: 'sibling', status: 'completed', metrics_json: '{"tokens":12}' });
assert.equal(assess('02', sibling).status, 'failed');
const wrongUsage = fixture(); delete wrongUsage.events[0].usage;
wrongUsage.events.push({ ...fixture().events[0], agentId: 'sibling', run: 'sibling-run' });
assert.equal(assess('02', wrongUsage).status, 'unmeasured');
const anotherRun = fixture(); anotherRun.events[0].run = 'unbound-run';
assert.equal(assess('02', anotherRun).status, 'unmeasured');
const latestRunning = fixture(); latestRunning.runs.push({ id: 'new-run', agent_id: 'worker', status: 'running' });
assert.equal(assess('02', latestRunning).status, 'unmeasured');
const cli = { workerId: 'worker', orchestratorId: 'parent', agents: [{ id: 'worker' }] };
assert.deepEqual(cliReceipt('bootstrap\n'+JSON.stringify(cli)+'\n'), cli);
assert.equal(cliReceipt('bootstrap only'), null);
console.log('Qwen assessment uses only the intended worker, mission, run and measured model: PASS');

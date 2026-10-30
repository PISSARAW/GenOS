'use strict';
const assert = require('node:assert/strict');
const { assess } = require('../../benchmarks/qwen-worker-missions/assess.cjs');
const inspection = report => ({
  cli: { workerId: 'worker', orchestratorId: 'parent', agents: [{ id: 'worker' }] }, expectedModel: 'ollama://qwen-test',
  agents: [{ id: 'worker', parent_agent_id: 'parent', execution_mode: 'worker' }],
  missions: [{ mission_id: 'mission', orchestrator_agent_id: 'parent' }], members: [{ mission_id: 'mission', agent_id: 'worker' }],
  bindings: [{ run_id: 'fixture-run', mission_id: 'mission', agent_id: 'worker' }],
  runs: [{ id: 'fixture-run', agent_id: 'worker', status: 'completed', metrics_json: '{"tokens":10}' }],
  events: [{ type: 'AGENT_COMPLETED', agentId: 'worker', run: 'fixture-run', provider: 'ollama', model: 'ollama://qwen-test', usage: { tokens: 10 }, report: { outcome: 'success', ...report } }] });
const claims = statements => inspection({ claims: statements.map(statement => ({ statement, evidence: ['mission'] })) });
const scheduling = JSON.stringify({machines:[{id:1,jobs:['A','D'],load:36},{id:2,jobs:['B','C'],load:34}],total:70,makespan:36,optimal:true});
assert.equal(assess('01', claims([scheduling])).status, 'passed');
assert.equal(assess('01', claims([scheduling.replace('"total":70','"total":80')])).status, 'failed');
assert.equal(assess('01', claims([scheduling.replace('"id":2','"id":1')])).status, 'failed');
assert.equal(assess('01', claims([scheduling.replace('"load":36','"load":40')])).status, 'failed');
assert.equal(assess('01', claims([scheduling.replace('"D"','"A"')])).status, 'failed');
assert.equal(assess('01', claims(['Both machines load 40.'])).status, 'unmeasured');
const sales = JSON.stringify({count:7,sum:210,mean:30,median:30,maximum:60});
assert.equal(assess('02', claims([sales])).status, 'passed');
assert.equal(assess('02', claims([JSON.stringify(JSON.parse(sales), null, 2)])).status, 'passed');
assert.equal(assess('02', claims(['{"maximum":60,"median":30,"mean":30,"sum":210,"count":7}'])).status, 'passed');
assert.equal(assess('02', claims([sales.replace('210','250')])).status, 'failed');
assert.equal(assess('02', claims(['Numeric count is not 7. Sum is not 210. Mean is not 30. Median is not 30. Maximum is not 60.'])).status, 'unmeasured');
assert.equal(assess('02', claims([sales,'Correction: sum is 250.'])).status, 'unmeasured');
assert.equal(assess('02', claims(['{"count":7,"sum":250,"sum":210,"mean":30,"median":30,"maximum":60}'])).status, 'unmeasured');
assert.equal(assess('02', claims([sales.replace('210','"210"')])).status, 'unmeasured');
const logs = JSON.stringify({matches:[{source:'log1',offset:5},{source:'log2',offset:0},{source:'log2',offset:8},{source:'log3',offset:11}]});
assert.equal(assess('04', claims([logs])).status, 'passed');
assert.equal(assess('04', claims([logs.replace('11','15')])).status, 'failed');
assert.equal(assess('04', claims([logs.replace(',{"source":"log3","offset":11}','')])).status, 'failed');
assert.equal(assess('04', claims(['log1 offsets are not 5; log2 not 0,8; log3 not 11'])).status, 'unmeasured');
const latency = JSON.stringify({mean_before:115,mean_after:101.25,difference:13.75,causal:false});
assert.equal(assess('06', claims([latency])).status, 'passed');
assert.equal(assess('06', claims([latency.replace('115','1105')])).status, 'failed');
assert.equal(assess('06', claims([latency.replace('false','true')])).status, 'failed');
assert.equal(assess('06', claims([latency,'The mean before is 999.'])).status, 'unmeasured');
assert.equal(assess('06', inspection({claims:[{statement:latency}],workerArtifact:{content:{measurements:[{metric:'mean_before',value:999,unit:'ms'},{metric:'mean_after',value:101.25,unit:'ms'},{metric:'difference',value:13.75,unit:'ms'}]}}})).status, 'failed');
const creative = candidate => inspection({ workerArtifact: { content: { candidate } } });
const poem = `${Array(6).fill('La pluie tombe').join('\n')}\n\n${Array(6).fill('La terre chante').join('\n')}`;
assert.equal(assess('08', creative(poem)).status, 'passed');
assert.equal(assess('08', creative(poem.replace('La terre chante', 'La nuit chante'))).status, 'failed');
assert.equal(assess('08', creative(Array(6).fill('Pluie').join('\n'))).status, 'failed');
const abc = 'X:1\nM:4/4\nL:1/4\nQ:1/4=96\nK:C\nC D E F | G A B c | C D E G | G A B d | D E F G | A G F E | C D E F | G A B c |';
assert.equal(assess('09', creative(abc)).status, 'passed');
assert.equal(assess('09', creative(abc.replace('X:1','X: tempo=96'))).status, 'failed');
assert.equal(assess('09', creative(abc.replace('C D E F |','C4 D4 E4 F4 |'))).status, 'failed');
assert.equal(assess('09', creative(abc.replace('C D E G |','[CE]2 G2 |'))).status, 'unmeasured');
assert.equal(assess('09', creative(abc.replace('G A B c |', 'G A B c | G A B c |'))).status, 'failed');
assert.equal(assess('08', { events: [] }).status, 'unmeasured');
assert.equal(assess('99', claims(['anything'])).status, 'unmeasured');
assert.equal(assess('01', claims([scheduling])).genosSemanticOracle, false);
const refusal = inspection({ outcome: 'unresolved', claims: [], uncertainties: ['Required input missing.'] });
assert.equal(assess('02', refusal, { negative: true }).status, 'passed');
assert.equal(assess('02', claims([sales]), { negative: true }).status, 'failed');
const falseCompletion = inspection({ outcome: 'unresolved', claims: [], uncertainties: ['Input missing.'],
  scopeCompletion: { completedRefs: ['mission'] } });
assert.equal(assess('02', falseCompletion, { negative: true }).status, 'failed');
assert.equal(assess('09', { events: [{ type: 'AGENT_FAILED', diagnostics: { error: 'OUTPUT_SCHEMA_VIOLATION' } }] }, { negative: true }).status, 'unmeasured');
const unresolvedVerdict = inspection({ workerArtifact: { type: 'verification_report', content: { verdict: 'unresolved' } } });
assert.equal(assess('10', unresolvedVerdict, { negative: true }).status, 'passed');
console.log('External Qwen numerical/formal assessment: PASS');

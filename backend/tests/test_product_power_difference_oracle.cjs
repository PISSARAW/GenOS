'use strict';

const assert = require('node:assert/strict');
const kinds = require('../src/services/agents/workerKindService');
const artifacts = require('../src/services/agents/workerArtifactContract');
const checks = require('../src/services/epistemic/oracleProductPowerChecks');
const contract = require('../src/services/productPowerDifference/contract');

function subject() {
  const premises = { A: 8, B: 20, C: 22, D: 3, E: 3 };
  const method = { version: 1, methodId: 'prompt_defined',
    evaluator: { domain: contract.DOMAIN, version: 1 }, parameters: { premises } };
  const workerContract = kinds.buildWorkerContract('specialist', { prompt: 'Compute the sealed equation.',
    scope: 'mission', orchestratorAgentId: 'parent', nicheDomain: 'biome:population_specialist', methodContract: method });
  const value = { domain: contract.DOMAIN, method,
    result: { candidate: { ...premises, N: 10805 }, source: {
      runId: 'run', workerId: 'worker', workerKind: 'specialist', workerContract, methodContract: method
    } } };
  rebind(value);
  return value;
}

function rebind(value) {
  const raw = { outcome: 'success', claims: [{ statement: JSON.stringify(value.result.candidate), evidence: ['mission'] }],
    uncertainties: [], specialtyAssessment: { niche: 'biome:population_specialist', inScope: true, evidence: ['mission'] } };
  value.result.source.report = { ...raw, fullText: JSON.stringify(raw), fullTextTruncated: false,
    workerArtifact: artifacts.buildWorkerArtifact('specialist', JSON.stringify(raw),
      { methodContract: value.method, allowedEvidenceRefs: ['mission'], source: 'unit-fixture' }) };
}

async function main() {
  const good = subject();
  const processes = [];
  for (const strategy of checks.STRATEGIES) {
    assert.equal(checks.check(good, strategy).status, 'verified');
    const wrong = structuredClone(good); wrong.result.candidate.N++; rebind(wrong);
    assert.equal(checks.check(wrong, strategy).status, 'refuted');
    const foreign = structuredClone(good); foreign.result.candidate.A++; rebind(foreign);
    assert.equal(checks.check(foreign, strategy).status, 'refuted');
    const forged = structuredClone(good); forged.result.candidate.N++;
    assert.equal(checks.check(forged, strategy).status, 'refuted');
    const executed = await require('../src/services/epistemic/oracleNativeProcess').run(good,
      { kind: 'observation', strategy, timeoutMs: 10000 });
    assert.equal(executed.result.status, 'verified');
    assert.notEqual(executed.detail.processId, process.pid);
    processes.push(executed.detail.processId);
  }
  assert.equal(new Set(processes).size, 2);
  assert.equal(contract.premisesValid({ ...good.method.parameters.premises, D: -1 }), false);
  assert.equal(contract.premisesValid({ ...good.method.parameters.premises, D: 1000000 }), false);
  assert.throws(() => contract.parse({ claims: [{ statement: 'Result obtained successfully' }] }));
  const truth = require('../src/services/workerEvidenceTruthGate');
  assert.equal(truth.missionId({ normalizedMission: { missionId: 'root' },
    autonomyPlan: { trinity: { missionId: 'child' } } }), 'child');
  console.log('Equation oracle: two real independent processes, arithmetic, foreign premises, forged text and false-success refusals passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

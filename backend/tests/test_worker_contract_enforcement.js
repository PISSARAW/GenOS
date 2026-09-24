'use strict';

const assert = require('node:assert/strict');
const workerKinds = require('../src/services/agents/workerKindService');
const enforcement = require('../src/services/agents/workerContractEnforcement');
const { validateWorkerDossiers } = require('../src/services/agentEvidenceService');

const CONTENT = {
  scout_observation: { observations: ['found'] },
  dossier: { claims: [{ statement: 'claim', evidence: ['ref'] }] },
  verification_report: { verdict: 'Accept', evidence: ['reproduction-ref'] },
  experiment_record: { hypothesis: 'h', protocol: ['p'], measurements: ['1'] },
  formal_certificate: { claim: 'c', solver: 's', result: 'valid' },
  synthesis_dossier: { synthesis: 's', sources: ['ref'] },
  creative_candidate: { candidate: 'draft' },
  clinical_report: { diagnoses: ['d'], uncertainty: 'low' },
  causal_dossier: { causalChain: ['a', 'b'], evidence: ['ref'] },
  training_packet: { prerequisites: ['p'], steps: ['s'], evidence: ['ref'] }
};

function dossier(kind, contract, artifactType = contract.evidence.requiredArtifacts[0]) {
  return {
    workerId: kind,
    events: [{ evidenceReport: { workerArtifact: {
      type: artifactType, content: CONTENT[artifactType], provenance: { source: 'test-ref' }
    } } }]
  };
}

for (const kind of Object.keys(workerKinds.KINDS)) {
  const contract = workerKinds.buildWorkerContract(kind, { scope: '/workspace' });
  const required = contract.evidence.requiredArtifacts[0];
  const wrongType = required === 'creative_candidate' ? 'dossier' : 'creative_candidate';
  enforcement.assertRuntimeContract(contract, kind);
  assert.doesNotThrow(() => validateWorkerDossiers([dossier(kind, contract)], [{ agentId: kind, workerContract: contract }]));
  assert.throws(
    () => validateWorkerDossiers([dossier(kind, contract, wrongType)], [{ agentId: kind, workerContract: contract }]),
    { code: 'INVALID_WORKER_ARTIFACT' }
  );
}

const nested = workerKinds.buildWorkerContract('sub_orchestrator');
assert.equal(nested.authority.spawn, false);
assert.equal(nested.authority.delegate, false);
assert.equal(nested.spawnBudget, 0);
assert.throws(() => enforcement.assertRuntimeContract({ ...nested, authority: { ...nested.authority, spawn: true } }, 'sub_orchestrator'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
assert.throws(() => enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('verifier_worker'), 'genos_merge'), { code: 'WORKER_CONTRACT_DENIED' });
assert.throws(() => enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('creative_worker'), 'genos_search_failures'), { code: 'WORKER_CONTRACT_DENIED' });
assert.equal(enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('bounded_worker'), 'genos_search_failures'), true);
async function verifyPersistedTools() {
  assert.equal(await enforcement.enforcePersistedWorkerTool({
    get: async () => ({ execution_mode: 'worker', role: 'implementation', metadata_json: JSON.stringify({ workerKind: 'bounded_worker' }) })
  }, 'worker-1', 'genos_search_failures'), true);
  await assert.rejects(() => enforcement.enforcePersistedWorkerTool({
    get: async () => ({ execution_mode: 'worker', role: 'literary_author', metadata_json: JSON.stringify({ workerKind: 'creative_worker' }) })
  }, 'worker-2', 'genos_search_failures'), { code: 'WORKER_CONTRACT_DENIED' });
}

verifyPersistedTools().then(() => console.log('Worker contracts enforce MCP authority and typed evidence artifacts for all 19 kinds.'));

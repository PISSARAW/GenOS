'use strict';

const assert = require('node:assert/strict');
const workerKinds = require('../src/services/agents/workerKindService');
const enforcement = require('../src/services/agents/workerContractEnforcement');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { validateWorkerDossiers } = require('../src/services/agentEvidenceService');
const leasePolicy = require('../src/services/toolLeasePolicy');
const { classifyConscienceEvent, applyDomainStateFromEvent } = require('../src/services/agentProcessEventPipeline');
const { buildWorkerArtifact, inspectWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
const { workerComplianceScenario } = require('./fixtures/workerComplianceScenarios');

const CONTENT = {
  scout_observation: { observations: ['found'] },
  dossier: { claims: [{ statement: 'claim', evidence: ['ref'] }] },
  verification_report: { verdict: 'Accept', evidence: ['reproduction-ref'] },
  experiment_record: { hypothesis: 'h', protocol: ['p'], measurements: ['1'] },
  formal_certificate: { claim: 'c', solver: 's', result: 'valid', solverReceipt: { id: 'receipt-1', evidence: ['solver://fixture/receipt-1'] } },
  synthesis_dossier: { synthesis: 's', sources: ['ref'] },
  creative_candidate: { candidate: 'draft', assumptions: ['a'], falsificationTest: 'test' },
  clinical_report: { caseScope: 'synthetic_educational', differentialConsiderations: ['general possibility'], uncertainty: 'high', safetyNote: 'No individual diagnosis or treatment advice.' },
  causal_dossier: { causalChain: ['a', 'b'], evidence: ['ref'] },
  training_packet: { prerequisites: ['p'], steps: ['s'], evidence: ['ref'] }
};

assert.equal(workerComplianceScenario('red_worker').receipt.testPassed, true);
assert.equal(workerComplianceScenario('formal_worker').receipt.result, 'valid');
assert.equal(workerComplianceScenario('forensic_worker').receipt.events[1].ready, false);
assert.equal(workerComplianceScenario('medical_worker').receipt.realPatient, false);

function dossier(kind, contract, artifactType = contract.evidence.requiredArtifacts[0]) {
  return {
    workerId: kind,
    events: [{ evidenceReport: { workerArtifact: {
      type: artifactType, content: CONTENT[artifactType], provenance: { source: 'test-ref' }
    } } }]
  };
}

for (const kind of Object.keys(workerKinds.KINDS)) {
  const scenario = workerComplianceScenario(kind);
  const mission = buildWorkerMission({ workerKind: kind, prompt: `${scenario.prompt} Source evidence: ${scenario.sourceRef}`, workspaceRoot: '/workspace' });
  const contract = mission.workerContract;
  const required = contract.evidence.requiredArtifacts[0];
  const wrongType = required === 'creative_candidate' ? 'dossier' : 'creative_candidate';
  const artifactReply = JSON.stringify({
    outcome: 'success', claims: CONTENT.dossier.claims,
    workerArtifact: { type: required, content: CONTENT[required], provenance: { sourceRefs: ['fixture-ref'] } }
  });
  assert.equal(buildWorkerArtifact(kind, artifactReply, { source: 'runtime', model: 'fixture' })?.type, required);
  if (required === 'dossier') {
    assert.equal(buildWorkerArtifact(kind, JSON.stringify({ outcome: 'success', claims: CONTENT.dossier.claims }), { source: 'runtime' })?.type, 'dossier');
  }
  assert.equal(buildWorkerArtifact(kind, 'unstructured response', { source: 'runtime' }), null);
  assert.match(mission.prompt, new RegExp(workerKinds.promptRule(kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (required === 'dossier') assert.match(mission.prompt, /top-level claims form the dossier/);
  else {
    assert.match(mission.prompt, new RegExp(`type must be ${required}`));
    assert.match(mission.prompt, /Do not put type or content at the root/);
  }
  assert.match(mission.prompt, new RegExp(scenario.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  enforcement.assertRuntimeContract(contract, kind);
  assert.throws(() => enforcement.assertWorkerToolAllowed(contract, 'genos_topology_session'), { code: 'WORKER_CONTRACT_DENIED' });
  assert.doesNotThrow(() => validateWorkerDossiers([dossier(kind, contract)], [{ agentId: kind, workerContract: contract }]));
  assert.throws(
    () => validateWorkerDossiers([dossier(kind, contract, wrongType)], [{ agentId: kind, workerContract: contract }]),
    { code: 'INVALID_WORKER_ARTIFACT' }
  );
}

assert(inspectWorkerArtifact('red_worker', { outcome: 'success', claims: CONTENT.dossier.claims, type: 'verification_report', content: CONTENT.verification_report }).issues.includes('workerArtifact.missing'));
assert(inspectWorkerArtifact('formal_worker', { outcome: 'success', claims: CONTENT.dossier.claims, workerArtifact: { type: 'formal_certificate', content: { claim: 'c', solver: 's', result: 'valid' } } }).issues.includes('workerArtifact.content.solverReceipt.missing_or_invalid'));
assert(inspectWorkerArtifact('creative_worker', { outcome: 'success', claims: CONTENT.dossier.claims, workerArtifact: { type: 'creative_candidate', content: { candidate: 'draft' } } }).issues.includes('workerArtifact.content.assumptions.missing_or_invalid'));
assert(inspectWorkerArtifact('medical_worker', { outcome: 'success', claims: CONTENT.dossier.claims, workerArtifact: { type: 'clinical_report', content: { diagnoses: ['x'], caseScope: 'synthetic_educational', differentialConsiderations: ['x'], uncertainty: 'high', safetyNote: 'No advice.' } } }).issues.some((issue) => issue.includes('non_diagnostic')));

const specialized = workerKinds.buildWorkerContract('formal_worker');
const genericSuccess = { eventType: 'EVIDENCE_REPORT', severity: 'info', payload: {
  outcome: 'success', claims: [{ statement: 'claim', evidence: ['source'] }],
  workerArtifact: { type: 'dossier', content: CONTENT.dossier, provenance: { source: 'runtime' } }
} };
assert.equal(classifyConscienceEvent({ event: genericSuccess, eventType: 'EVIDENCE_REPORT', workerContract: specialized }).isSuccessEvent, false);
const state = { missionDomainState: { hasDomainFailure: false, unverified: true, domainVerdict: 'unverified' } };
applyDomainStateFromEvent({ state, event: genericSuccess, eventType: 'EVIDENCE_REPORT', workerContract: specialized });
assert.equal(state.missionDomainState.domainVerdict, 'failed');

const nested = workerKinds.buildWorkerContract('sub_orchestrator');
assert.equal(nested.authority.spawn, false);
assert.equal(nested.authority.delegate, false);
assert.equal(nested.spawnBudget, 0);
assert.throws(() => enforcement.assertRuntimeContract({ ...nested, authority: { ...nested.authority, spawn: true } }, 'sub_orchestrator'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
const delegated = workerKinds.grantBoundedDelegation(workerKinds.buildWorkerContract('sub_orchestrator'));
assert.equal(enforcement.assertRuntimeContract(delegated, 'sub_orchestrator'), true);
assert.throws(() => enforcement.assertRuntimeContract({ ...delegated, delegationExpiresAt: Date.now() - 1 }, 'sub_orchestrator'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
assert(leasePolicy.workerLeaseForRole('sub_orchestrator').includes('genos_delegate_worker'));
assert(!leasePolicy.workerLeaseForRole('bounded_worker').includes('genos_delegate_worker'));
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

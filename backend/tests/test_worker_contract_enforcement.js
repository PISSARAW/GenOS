'use strict';

const assert = require('node:assert/strict');
const workerKinds = require('../src/services/agents/workerKindService');
const enforcement = require('../src/services/agents/workerContractEnforcement');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { validateWorkerDossiers } = require('../src/services/agentEvidenceService');
const leasePolicy = require('../src/services/toolLeasePolicy');
const { classifyConscienceEvent, applyDomainStateFromEvent } = require('../src/services/agentProcessEventPipeline');
const { buildWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

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
  const scenario = missionScenario(kind);
  const mission = buildWorkerMission({ workerKind: kind, prompt: scenario, workspaceRoot: '/workspace' });
  const contract = mission.workerContract;
  const required = contract.evidence.requiredArtifacts[0];
  const wrongType = required === 'creative_candidate' ? 'dossier' : 'creative_candidate';
  const artifactReply = required === 'dossier' ? 'grounded claim' : JSON.stringify({ type: required, content: CONTENT[required] });
  assert.equal(buildWorkerArtifact(kind, artifactReply, { source: 'runtime', model: 'fixture' })?.type, required);
  if (required !== 'dossier') assert.equal(buildWorkerArtifact(kind, 'unstructured response', { source: 'runtime' }), null);
  assert.match(mission.prompt, new RegExp(workerKinds.promptRule(kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(mission.prompt, new RegExp(`type must be ${required}`));
  assert.match(mission.prompt, new RegExp(scenario));
  enforcement.assertRuntimeContract(contract, kind);
  assert.doesNotThrow(() => validateWorkerDossiers([dossier(kind, contract)], [{ agentId: kind, workerContract: contract }]));
  assert.throws(
    () => validateWorkerDossiers([dossier(kind, contract, wrongType)], [{ agentId: kind, workerContract: contract }]),
    { code: 'INVALID_WORKER_ARTIFACT' }
  );
}

const specialized = workerKinds.buildWorkerContract('formal_worker');
const genericSuccess = { eventType: 'EVIDENCE_REPORT', severity: 'info', payload: {
  outcome: 'success', claims: [{ statement: 'claim', evidence: ['source'] }],
  workerArtifact: { type: 'dossier', content: CONTENT.dossier, provenance: { source: 'runtime' } }
} };
assert.equal(classifyConscienceEvent({ event: genericSuccess, eventType: 'EVIDENCE_REPORT', workerContract: specialized }).isSuccessEvent, false);
const state = { missionDomainState: { hasDomainFailure: false, unverified: true, domainVerdict: 'unverified' } };
applyDomainStateFromEvent({ state, event: genericSuccess, eventType: 'EVIDENCE_REPORT', workerContract: specialized });
assert.equal(state.missionDomainState.domainVerdict, 'failed');

function missionScenario(kind) {
  const scenarios = {
    scout_cell: 'Observe the repository and cite files without changing them.',
    resident_daemon: 'Monitor worker health and report evidence-backed anomalies.',
    bounded_worker: 'Implement the assigned bounded change and report verification evidence.',
    adaptive_worker: 'Compare permitted strategies and use the best within budget.',
    specialist: 'Review the assigned narrow domain and state its boundaries.',
    procedural_executor: 'Run the deterministic procedure and return its receipts.',
    symbiotic_worker: 'Use only host-granted capabilities and report the handoff.',
    verifier_worker: 'Independently verify the claim and return a verdict with reproduction evidence.',
    red_worker: 'Find a falsifiable failure case and attach reproduction evidence.',
    experimental_worker: 'Test the hypothesis with a stated protocol and measurements.',
    formal_worker: 'Prove the exact claim and identify the solver result.',
    synthesis_worker: 'Synthesize source dossiers and preserve disagreements.',
    creative_worker: 'Produce a candidate draft with assumptions and a falsification test.',
    medical_worker: 'Assess candidate diagnoses with evidence and uncertainty.',
    recovery_worker: 'Apply the leased recovery action and report the restored state.',
    forensic_worker: 'Reconstruct the causal chain from receipts and label hypotheses.',
    liaison_worker: 'Prepare a sourced handoff between the assigned groups.',
    teaching_worker: 'Write a validated procedure with prerequisites and evidence.',
    sub_orchestrator: 'Coordinate only the assigned subgraph and report its bounded outcome.'
  };
  return scenarios[kind];
}

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

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
  scout_observation: { observations: [{ observation: 'found', sourceRefs: ['ref'], confidence: 1, uncertainties: [] }] },
  dossier: { claims: [{ statement: 'claim', evidence: ['ref'] }] },
  verification_report: { testedClaim: 'claim', verificationMethod: 'fixture comparison', reproductionSteps: ['Compare fixture'], verdict: 'Accept', evidence: ['reproduction-ref'], counterexamples: [{ claim: 'all pass', attack: 'fixture failure', reproductionSteps: ['Compare fixture'], evidence: ['reproduction-ref'] }] },
  experiment_record: { hypothesis: 'h', protocol: ['p'], measurements: [{ metric: 'fixture', value: 1, unit: 'count', evidence: ['ref'] }] },
  formal_certificate: { claim: 'c', solver: 's', result: 'valid', solverReceipt: { id: 'receipt-1', claim: 'c', solver: 's', result: 'valid', evidence: ['solver://fixture/receipt-1'] } },
  synthesis_dossier: { synthesis: 's', sources: ['ref'], disagreements: [] },
  creative_candidate: { candidate: 'draft', assumptions: ['a'], falsificationTest: 'test' },
  clinical_report: { caseScope: 'synthetic_educational', differentialConsiderations: ['general possibility'], uncertainty: 'high', safetyNote: 'No individual diagnosis or treatment advice.' },
  causal_dossier: { causalChain: [{ from: 'a', to: 'b', relation: 'fixture relation', evidence: ['ref'] }], evidence: ['ref'] },
  training_packet: { prerequisites: ['p'], steps: ['s'], evidence: ['ref'] }
};

const KIND_CONTENT = {
  resident_daemon: { territoryReport: { territoryId: 'fixture', observedAt: '2026-10-06T00:00:00Z', sourceRefs: ['ref'] } },
  bounded_worker: { scopeCompletion: { scopeRef: '/workspace', completedRefs: ['ref'] } },
  adaptive_worker: { strategyTrace: [{ strategy: 'controlled_probe', decision: 'retained', reason: 'Fixture strategy', evidence: ['ref'] }] },
  specialist: { specialtyAssessment: { niche: 'fixture-domain', inScope: true, evidence: ['ref'] } },
  symbiotic_worker: { hostContribution: { hostContractId: 'fixture-host', capability: 'fixture-capability', contractCompliant: true, evidence: ['ref'] } },
  recovery_worker: { recoveryReceipt: { action: 'fixture action', restoredState: 'fixture state', receiptId: 'fixture receipt', evidence: ['ref'] } },
  liaison_worker: { handoff: { sourceGroup: 'a', targetGroup: 'b', deliveredRefs: ['ref'] } },
  sub_orchestrator: { childSummaries: [] }
};

assert.equal(workerComplianceScenario('red_worker').receipt.testPassed, true);
assert.equal(workerComplianceScenario('formal_worker').receipt.fixtureOnly, true);
assert.equal(workerComplianceScenario('formal_worker').receipt.result, undefined);
assert.equal(workerComplianceScenario('forensic_worker').receipt.events[1].ready, false);
assert.equal(workerComplianceScenario('medical_worker').receipt.realPatient, false);

function dossier(kind, contract, artifactType = contract.evidence.requiredArtifacts[0]) {
  return {
    workerId: kind,
    events: [{ evidenceReport: { workerArtifact: {
      type: artifactType, content: { ...CONTENT[artifactType], ...(KIND_CONTENT[kind] || {}) }, provenance: { sourceRefs: ['test-ref'] }
    } } }]
  };
}

for (const kind of Object.keys(workerKinds.KINDS)) {
  const scenario = workerComplianceScenario(kind);
  const mission = buildWorkerMission({ workerKind: kind, prompt: `${scenario.prompt} Source evidence: ${scenario.sourceRef}`, workspaceRoot: '/workspace', specialtyNiche: 'fixture-domain', hostContractId: 'fixture-host', hostCapabilities: ['fixture-capability'] });
  const contract = mission.workerContract;
  const required = contract.evidence.requiredArtifacts[0];
  const wrongType = required === 'creative_candidate' ? 'dossier' : 'creative_candidate';
  const artifactReply = JSON.stringify({
    outcome: 'success', claims: CONTENT.dossier.claims, ...(KIND_CONTENT[kind] || {}),
    workerArtifact: { type: required, content: { ...CONTENT[required], ...(KIND_CONTENT[kind] || {}) }, provenance: { sourceRefs: ['fixture-ref'] } }
  });
  assert.equal(buildWorkerArtifact(kind, artifactReply, { source: 'runtime', model: 'fixture' })?.type, required);
  if (required === 'dossier') {
    assert.equal(buildWorkerArtifact(kind, JSON.stringify({ outcome: 'success', claims: CONTENT.dossier.claims, ...(KIND_CONTENT[kind] || {}) }), { source: 'runtime' })?.type, 'dossier');
  }
  assert.equal(buildWorkerArtifact(kind, 'unstructured response', { source: 'runtime' }), null);
  assert.match(mission.prompt, new RegExp(workerKinds.promptRule(kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (required === 'dossier') assert.match(mission.prompt, /claims/);
  else {
    assert.match(mission.prompt, new RegExp(`type must be ${required}`));
    assert.match(mission.prompt, /Do not put type or content at the root/);
  }
  assert.match(mission.prompt, new RegExp(scenario.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  enforcement.assertRuntimeContract(contract, kind);
  assert.throws(() => enforcement.assertWorkerToolAllowed(contract, 'genos_topology_session'), { code: 'WORKER_CONTRACT_DENIED' });
  assert.throws(() => enforcement.assertWorkerToolAllowed(contract, 'genos_topology_session', {
    operation: 'events', session_id: 'session-capability'
  }), { code: 'WORKER_CONTRACT_DENIED' });
  const scopedContract = { ...contract, mission: { ...contract.mission, topologySessionId: 'session-capability' } };
  assert.equal(enforcement.assertWorkerToolAllowed(scopedContract, 'genos_topology_session', {
    operation: 'events', session_id: 'session-capability'
  }), true);
  assert.throws(() => enforcement.assertWorkerToolAllowed(scopedContract, 'genos_topology_session', {
    operation: 'events', session_id: 'other-session'
  }), { code: 'WORKER_CONTRACT_DENIED' });
  assert.doesNotThrow(() => validateWorkerDossiers([dossier(kind, contract)], [{ agentId: kind, workerContract: contract }]));
  assert.throws(
    () => validateWorkerDossiers([dossier(kind, contract, wrongType)], [{ agentId: kind, workerContract: contract }]),
    { code: 'INVALID_WORKER_ARTIFACT' }
  );
}

assert(inspectWorkerArtifact('red_worker', { outcome: 'success', claims: CONTENT.dossier.claims, type: 'verification_report', content: CONTENT.verification_report }).issues.includes('workerArtifact.missing'));
assert(inspectWorkerArtifact('formal_worker', { outcome: 'success', claims: CONTENT.dossier.claims, workerArtifact: { type: 'formal_certificate', content: { claim: 'c', solver: 's', result: 'valid' } } }).issues.some((issue) => issue.includes('solverReceipt')));
assert(inspectWorkerArtifact('creative_worker', { outcome: 'success', claims: CONTENT.dossier.claims, workerArtifact: { type: 'creative_candidate', content: { candidate: 'draft' } } }).issues.includes('workerArtifact.content.assumptions.missing_or_invalid'));
assert(inspectWorkerArtifact('medical_worker', { outcome: 'success', claims: CONTENT.dossier.claims, workerArtifact: { type: 'clinical_report', content: { diagnoses: ['x'], caseScope: 'synthetic_educational', differentialConsiderations: ['x'], uncertainty: 'high', safetyNote: 'No advice.' } } }).issues.some((issue) => issue.includes('non_diagnostic')));

const specialized = workerKinds.buildWorkerContract('formal_worker');
const rhizomeScout = workerKinds.buildWorkerContract('scout_cell', {
  prompt: 'Rhizome discovery branch: map network dependencies.'
});
const rhizomeInstruction = workerKinds.evidenceRule(rhizomeScout);
assert.match(rhizomeInstruction, /capabilities/);
assert.match(rhizomeInstruction, /unknownDependencies/);
assert.match(rhizomeInstruction, /workerArtifact/);
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
const smallerGrant = workerKinds.grantBoundedDelegation(workerKinds.buildWorkerContract('sub_orchestrator', { workerTokenLimit: 2400 }));
assert.equal(smallerGrant.limits.maxTokens, 2400);
assert.equal(Object.hasOwn(smallerGrant.resources, 'maxDelegatedTokens'), false);
assert.equal(enforcement.assertRuntimeContract(smallerGrant, 'sub_orchestrator'), true);
const persistedModelContract = structuredClone(smallerGrant);
assert.equal(enforcement.assertRuntimeContract(persistedModelContract, 'sub_orchestrator'), true);
const nativeCoordination = workerKinds.buildWorkerContract('sub_orchestrator', {
  methodContract: { version: 1, methodId: 'coordinate_children', parameters: { children: [] } }, workerTokenLimit: 2400
});
assert.equal(nativeCoordination.resources.maxTokens, 0);
assert.equal(nativeCoordination.resources.maxDelegatedTokens, 2400);
const nativeGrant = workerKinds.grantBoundedDelegation(nativeCoordination);
assert.equal(nativeGrant.limits.maxTokens, 2400);
assert.equal(enforcement.assertRuntimeContract(nativeGrant, 'sub_orchestrator'), true);
assert.throws(() => workerKinds.grantBoundedDelegation(workerKinds.buildWorkerContract('sub_orchestrator', {
  methodContract: nativeCoordination.mission.methodContract, delegatedTokenLimit: 0
})), { code: 'SUBORCHESTRATOR_TOKEN_LIMIT' });
assert.throws(() => enforcement.assertRuntimeContract({ ...nativeGrant, resources: {
  ...nativeGrant.resources, maxDelegatedTokens: 10001
} }, 'sub_orchestrator'), { code: 'INVALID_WORKER_CONTRACT' });
assert.throws(() => enforcement.assertRuntimeContract({ ...smallerGrant, limits: { ...smallerGrant.limits, maxTokens: 2401 } }, 'sub_orchestrator'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
assert.equal(delegated.authority.communicate, true);
assert.throws(() => enforcement.assertRuntimeContract({ ...delegated, delegationExpiresAt: Date.now() - 1 }, 'sub_orchestrator'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
assert(leasePolicy.workerLeaseForRole('sub_orchestrator').includes('genos_delegate_worker'));
assert(!leasePolicy.workerLeaseForRole('bounded_worker').includes('genos_delegate_worker'));
assert.throws(() => enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('verifier_worker'), 'genos_merge'), { code: 'WORKER_CONTRACT_DENIED' });
assert.equal(enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('creative_worker'), 'genos_search_failures'), true);
assert.equal(enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('bounded_worker'), 'genos_search_failures'), true);
assert.equal(enforcement.toolAction('genos_inspect'), 'read');
assert.equal(enforcement.toolAction('genos_test'), 'execute');
assert.equal(enforcement.toolAction('unregistered_worker_tool'), 'unknown');
assert.equal(enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('scout_cell'), 'genos_inspect'), true);
assert.throws(() => enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('scout_cell'), 'unregistered_worker_tool'), { code: 'WORKER_CONTRACT_DENIED' });
assert.equal(enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('adaptive_worker'), 'genos_worker_publish'), true);
assert.equal(enforcement.assertWorkerToolAllowed(workerKinds.buildWorkerContract('bounded_worker'), 'genos_worker_publish'), true);
const assignedContract = workerKinds.buildWorkerContract('procedural_executor', {
  prompt: 'solve exactly', scope: '/repo', workerAssignment: { workerKind: 'procedural_executor' },
  methodContract: { version: 1, methodId: 'dynamic_programming' }
});
assert.equal(assignedContract.assignment.workerKind, 'procedural_executor');
assert.equal(assignedContract.mission.methodContract.methodId, 'dynamic_programming');
assert.equal(assignedContract.resources.maxTokens, 0);
const boundedContract = workerKinds.buildWorkerContract('bounded_worker');
assert.throws(() => enforcement.assertRuntimeContract({
  ...boundedContract, authority: { ...boundedContract.authority, promote: true }
}, 'bounded_worker'), { code: 'INVALID_WORKER_CONTRACT' });
assert.throws(() => enforcement.assertRuntimeContract({
  ...boundedContract, resources: { ...boundedContract.resources, maxTokens: 100000 }
}, 'bounded_worker'), { code: 'INVALID_WORKER_CONTRACT' });
assert.throws(() => enforcement.assertRuntimeContract({
  ...boundedContract, evidence: { requiredArtifacts: [], provenanceRequired: false }
}, 'bounded_worker'), { code: 'INVALID_WORKER_CONTRACT' });
async function verifyPersistedTools() {
  assert.equal(await enforcement.enforcePersistedWorkerTool({
    get: async () => ({ execution_mode: 'worker', role: 'implementation', metadata_json: JSON.stringify({ workerKind: 'bounded_worker' }) })
  }, 'worker-1', 'genos_search_failures'), true);
  assert.equal(await enforcement.enforcePersistedWorkerTool({
    get: async () => ({ execution_mode: 'worker', role: 'literary_author', metadata_json: JSON.stringify({ workerKind: 'creative_worker' }) })
  }, 'worker-2', 'genos_search_failures'), true);
  const topologyContract = workerKinds.buildWorkerContract('bounded_worker', { topologySessionId: 'session-owned' });
  topologyContract.authority.read = true;
  const topologyWorker = { get: async () => ({ execution_mode: 'worker', role: 'implementation', metadata_json: JSON.stringify({
    workerKind: 'bounded_worker', topologySessionId: 'session-owned', workerContract: topologyContract
  }) }) };
  assert.equal(await enforcement.enforcePersistedWorkerTool(topologyWorker, 'worker-3', {
    toolName: 'genos_topology_session', args: { operation: 'events', session_id: 'session-owned' }
  }), true);
  const elevated = { ...boundedContract, authority: { ...boundedContract.authority, promote: true } };
  await assert.rejects(() => enforcement.enforcePersistedWorkerTool({
    get: async () => ({ execution_mode: 'worker', role: 'implementation', metadata_json: JSON.stringify({
      workerKind: 'bounded_worker', workerContract: elevated
    }) })
  }, 'worker-4', 'genos_merge'), { code: 'INVALID_WORKER_CONTRACT' });
  await assert.rejects(() => enforcement.enforcePersistedWorkerTool({
    get: async () => ({ execution_mode: 'worker', role: 'implementation', parent_agent_id: 'trusted-parent', metadata_json: JSON.stringify({
      workerKind: 'bounded_worker', workerContract: boundedContract
    }) })
  }, 'worker-5', 'genos_search_failures'), { code: 'INVALID_WORKER_CONTRACT' });
  await assert.rejects(() => enforcement.enforcePersistedWorkerTool(topologyWorker, 'worker-3', {
    toolName: 'genos_topology_session', args: { operation: 'events', session_id: 'other-session' }
  }), { code: 'WORKER_CONTRACT_DENIED' });
}

verifyPersistedTools().then(() => console.log('Worker contracts enforce MCP authority and typed evidence artifacts for all 19 kinds.'));

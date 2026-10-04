'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent?.filename.replace(/\\/g, '/').endsWith('variants/variantRuntimeService.js')) {
    const stubs = {
      '../health/dysbiosisDetector': { detectDysbiosis: () => ({ state: 'CLEAR' }) },
      './toolRuntimeService': { validateToolManifest: () => ({}), validateToolInvocation: () => ({}) },
      './edgeSyncRuntimeService': { reconcileEdgeEvents: () => ({}) },
      './immuneThreatRuntimeService': { reviewThreat: async () => ({}) },
      './regenerationRuntimeService': { planRegeneration: () => ({}) }
    };
    if (stubs[request]) return stubs[request];
  }
  return originalLoad.call(this, request, parent, isMain);
};
const runtime = require('../src/services/holobionte/variants/variantRuntimeService');
Module._load = originalLoad;
const regeneration = require('../src/services/holobionte/variants/regenerationRuntimeService');
const toolRuntime = require('../src/services/holobionte/variants/toolRuntimeService');
const edgeSync = require('../src/services/holobionte/variants/edgeSyncRuntimeService');
const immunePath = require.resolve('../src/services/holobionte/variants/immuneThreatRuntimeService');
Module._load = function loadImmune(request, parent, isMain) {
  if (parent?.filename.replace(/\\/g, '/').endsWith('variants/immuneThreatRuntimeService.js')) {
    if (request === '../immune/holobiontImmunePlane') return { reviewSymbiontOutput: async () => ({ allowed: true, decision: 'ALLOW' }) };
    if (request === '../immune/immuneOverreactionService') return { assessImmuneOverreaction: () => ({ state: 'NORMAL' }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[immunePath];
const immuneRuntime = require(immunePath);
Module._load = originalLoad;

function testOrganelleClosure() {
  const result = runtime.assessOrganelle({
    dependencyGraph: {
      nodes: [{ id: 'core', core: true }, { id: 'adapter' }, { id: 'worker' }, { id: 'leaf' }],
      edges: [{ source: 'adapter', target: 'core' }, { source: 'worker', target: 'adapter' }, { source: 'leaf', target: 'worker' }]
    }, evidenceRefs: ['graph:1']
  });
  assert.deepStrictEqual(result.coreDependencyClosureIds, ['core', 'adapter', 'worker', 'leaf']);
  assert.deepStrictEqual(result.dependentSymbiontIds, ['adapter', 'worker', 'leaf']);
}

function testAdaptiveFitnessPerSymbiont() {
  const result = runtime.assessEcology({ diversity: 3, diversityFloor: 2,
    fitnessBySymbiont: {
      stable: [{ score: 0.8, evidenceRefs: ['s:1'] }, { score: 0.82, evidenceRefs: ['s:2'] }],
      declining: [{ score: 0.5, evidenceRefs: ['d:1'] }, { score: 0.3, evidenceRefs: ['d:2'] }]
    } });
  assert.deepStrictEqual(result.decliningSymbiontIds, ['declining']);
  assert.strictEqual(result.action, 'REVIEW_CONTRIBUTORS');
  assert.strictEqual(result.automaticReplacement, false);
}

async function testImmuneBatchMemory() {
  const result = await immuneRuntime.reviewThreatBatch({ independentVerifierIds: ['v1', 'v2'],
    verifyThreatModel: () => true, threatModels: [{ id: 'known', riskScore: 0.2, indicators: ['known'], evidenceRefs: ['tm:1'] }],
    outputs: [{ outputId: 'one', resultHash: 'sha256:1', dangerSignals: ['known'] },
      { outputId: 'two', resultHash: 'sha256:2', dangerSignals: ['known'] }] });
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(result.blockedCount, 0);
  assert.deepStrictEqual(result.immuneMemory.map((item) => item.outputId), ['one', 'two']);
}

function testLocalExportProofGate() {
  const base = { variantId: 'local-first', availableEngines: ['local'], dataClasses: ['RESTRICTED'],
    restrictedDataClasses: ['RESTRICTED'], requireExportProof: true };
  const refused = runtime.planPlacement(base);
  assert.strictEqual(refused.accepted, false);
  assert.strictEqual(refused.reason, 'NO_EXPORT_PROOF_REQUIRED');
  const accepted = runtime.planPlacement({ ...base, attestNoExport: () => ({ receiptId: 'proof:1' }),
    verifyNoExport: (proof) => proof.receiptId === 'proof:1' });
  assert.strictEqual(accepted.accepted, true);
  assert.strictEqual(accepted.exportProofVerified, true);
}

function testRecoveryReservationGate() {
  const input = { damageScore: 0.85, evidenceRefs: ['damage:1'], replacementCandidate: { id: 'candidate' },
    restorationReceipt: { id: 'restore' }, verifyRestoration: () => true, verifyLineage: () => true,
    reserveRecoveryResources: () => ({ id: 'reservation' }), verifyRecoveryReservation: () => false,
    approveApoptosis: () => true };
  const result = regeneration.planRegeneration(input);
  assert.strictEqual(result.status, 'REPLACEMENT_READY');
  assert.strictEqual(result.resourcesReserved, false);
  assert.strictEqual(result.controlledApoptosisAllowed, false);
}

function testCloudEdgePlacementBatch() {
  const lease = { leaseId: 'lease', deviceId: 'edge-1', capabilities: ['camera'],
    expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const result = runtime.planPlacementBatch({ variantId: 'cloud-core/edge-symbionts', edgeConnected: true,
    edgeLease: lease, requiredEdgeCapability: 'camera', verifyEdgeLease: () => true,
    steps: [{ stepId: 'camera-a', availableEngines: ['cloud'] }, { stepId: 'camera-b', availableEngines: ['cloud'] }] });
  assert.strictEqual(result.accepted, true);
  assert.deepStrictEqual(result.steps.map((step) => step.host), ['cloud', 'cloud']);
}

function testEdgeCoreCloudOnDemandBatch() {
  const steps = Array.from({ length: 10 }, (_, index) => ({ stepId: `step-${index}`,
    availableEngines: index < 7 ? ['local'] : ['local', 'cloud'], requiresRemoteCapability: index >= 7,
    redacted: true, dataClasses: ['PUBLIC', 'RESTRICTED'], restrictedDataClasses: ['RESTRICTED'],
    verifyCloudConnectivity: () => index !== 8 }));
  const result = runtime.planPlacementBatch({ variantId: 'edge-core/cloud-symbionts', steps });
  assert.strictEqual(result.localCorePreserved, true);
  assert.deepStrictEqual(result.cloudOnDemandStepIds, ['step-7', 'step-8', 'step-9']);
  assert.strictEqual(result.steps[7].dataClasses.includes('RESTRICTED'), false);
  assert.strictEqual(result.steps[8].accepted, false);
}

function testMemoryPairwiseConflictsAndProvenance() {
  const memories = [
    { id: 'a', conceptKey: 'c', value: 'alpha', fitness: 0.4, memoryType: 'SEMANTIC', sourceId: 'src-1', evidenceRefs: ['a:1'] },
    { id: 'b', conceptKey: 'c', value: 'beta', fitness: 0.8, memoryType: 'EPISODIC', sourceId: 'src-1', evidenceRefs: ['b:1'] },
    { id: 'c', conceptKey: 'c', value: 'gamma', fitness: 0.6, memoryType: 'SEMANTIC', sourceId: 'src-2', evidenceRefs: ['c:1'] }
  ];
  const result = runtime.planMemory({ memories });
  assert.strictEqual(result.conflicts.length, 3);
  assert.strictEqual(result.consolidation[0].id, 'b');
  assert.strictEqual(result.consolidation[0].provenance.sourceId, 'src-1');
  assert.deepStrictEqual(result.consolidation[0].provenance.evidenceRefs, ['b:1']);
  assert.strictEqual(result.automaticForgetting, false);
}

function testCompetitionSelectsProtectedGroupAlternative() {
  const budget = { tokens: 1000 };
  const candidates = [
    { id: 'raw-winner', score: 0.95, diversityGroup: 'new', budget, evidenceRefs: ['e:1'] },
    { id: 'protected-winner', score: 0.92, diversityGroup: 'protected', budget, evidenceRefs: ['e:2'] },
    { id: 'protected-runner', score: 0.80, diversityGroup: 'protected', budget, evidenceRefs: ['e:3'] }
  ];
  const result = runtime.selectCompetitivePartner({ candidates, budget, protectedGroups: ['protected'],
    verifyTrial: () => true, approveReplacement: (id) => id === 'protected-winner' });
  assert.strictEqual(result.champion.id, 'protected-winner');
  assert.strictEqual(result.replacementAuthorized, true);
}

function testProceduralRecruitmentContractGates() {
  const result = runtime.planRecruitment({ requiredCapabilities: ['parse', 'validate'], availableCapabilities: ['parse'],
    minimumPermissions: ['read', 'admin'], allowedPermissions: ['read'], dna: { id: 'dna-ok' }, plasmid: { id: 'plasmid-bad' },
    verifySourceArtifact: (artifact) => artifact.id === 'dna-ok' });
  assert.deepStrictEqual(result.gaps, ['validate']);
  assert.deepStrictEqual(result.contract.permissions, ['read']);
  assert.deepStrictEqual(result.contract.excludedPermissions, ['admin']);
  assert.deepStrictEqual(result.contract.sourceArtifacts, [{ id: 'dna-ok' }]);
  assert.strictEqual(result.contract.trialRequired, true);
  assert.strictEqual(result.autoAssimilate, false);
}

function testToolAdmissionAndInvocationGate() {
  const manifest = { name: 'calculator', version: '1.0', permissions: ['compute'],
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { result: { type: 'number' } } } };
  const base = { manifest, value: { a: 2, b: 3 }, leasedPermissions: ['compute'],
    toolLease: { toolName: 'calculator', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    verifyLease: () => true, verifyHealth: () => true, isRevoked: () => false };
  assert.strictEqual(toolRuntime.authorizeToolInvocation(base).allowed, true);
  assert.strictEqual(toolRuntime.authorizeToolInvocation({ ...base, value: { a: 2, b: 3, extra: true } }).reason, 'INPUT_SCHEMA_INVALID');
  assert.strictEqual(toolRuntime.authorizeToolInvocation({ ...base, leasedPermissions: [] }).reason, 'UNLEASED_PERMISSION');
}

function testEdgeSyncReportsFilteredEvents() {
  const event = (eventId, tick, capability) => ({ eventId, authorityZone: 'A', conflictKey: eventId,
    vectorClock: { A: tick }, capability, provenance: { evidenceRefs: [`proof:${eventId}`] } });
  const result = edgeSync.reconcileEdgeEvents({ authorityZones: ['A'], replicatedCapabilities: ['allowed'],
    verifyProvenance: () => true, events: [event('accepted', 1, 'allowed'), event('filtered', 2, 'other'),
      event('accepted', 3, 'allowed')] });
  assert.strictEqual(result.accepted.length, 1);
  assert.deepStrictEqual(result.rejected.map((item) => item.reason), ['CAPABILITY_NOT_REPLICATED', 'DUPLICATE_EVENT']);
  assert.deepStrictEqual(result.causalClocks, { A: { A: 1 } });
}

testOrganelleClosure();
testAdaptiveFitnessPerSymbiont();
testLocalExportProofGate();
testRecoveryReservationGate();
testCloudEdgePlacementBatch();
testEdgeCoreCloudOnDemandBatch();
testMemoryPairwiseConflictsAndProvenance();
testCompetitionSelectsProtectedGroupAlternative();
testProceduralRecruitmentContractGates();
testToolAdmissionAndInvocationGate();
testEdgeSyncReportsFilteredEvents();
testImmuneBatchMemory().catch((error) => { console.error(error); process.exitCode = 1; });
console.log('✅ Holobiont variant runtime contracts passed.');

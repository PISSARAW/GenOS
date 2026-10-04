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

testOrganelleClosure();
testAdaptiveFitnessPerSymbiont();
testLocalExportProofGate();
testRecoveryReservationGate();
testImmuneBatchMemory().catch((error) => { console.error(error); process.exitCode = 1; });
console.log('✅ Holobiont variant runtime contracts passed.');

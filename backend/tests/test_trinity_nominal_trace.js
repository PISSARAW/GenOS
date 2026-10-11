'use strict';

const assert = require('node:assert/strict');
const continuation = require('../src/services/trinityAdaptiveContinuationRunner');
const trace = require('../src/services/trinityQualificationTrace');
const qualification = require('../src/services/trinityNominalQualification');
const variants = require('../src/services/trinityVariantService');

const receipt = { status: 'verified', independent: true, evidenceDigest: 'sha256:sample',
  verifierDigest: 'sha256:verifier', independenceDescriptor: { actorId: 'verifier', workspaceId: 'isolated' } };
const report = { outcome: 'success', qdTargetNiche: 'niche_1:2', behaviorVector: [0.2, 0.3],
  behaviorVectorEvidence: ['measurement'], evidence: [{ id: 'measurement', verificationReceipt: receipt }] };
const world = { outcome: 'success', report };

assert.equal(continuation.validContinuationReport(world), true);
assert.equal(continuation.validContinuationReport({ ...world, outcome: 'failed' }), false);
assert.equal(continuation.validContinuationReport({ ...world, report: { ...report, evidence: [] } }), false);
assert.equal(continuation.validNicheReceipt(world, 'niche_1:2'), true);
assert.equal(continuation.validNicheReceipt({ ...world, report: { ...report, behaviorVectorEvidence: [] } }, 'niche_1:2'), false);
assert.equal(continuation.validNicheReceipt({ ...world, report: { ...report, behaviorVectorEvidence: ['unknown'] } }, 'niche_1:2'), false);
assert.equal(continuation.validNicheReceipt({ ...world, report: { ...report, behaviorVector: [NaN, 0.3] } }, 'niche_1:2'), false);
assert.equal(continuation.validNicheReceipt(world, 'niche_4:4'), false);

const gates = trace.fromComparison({ adaptiveBudgetExecution: { status: 'executed' },
  qualityDiversityReplicas: { status: 'incomplete', reason: 'replica_niche_receipt_missing' },
  sequentialExecution: { status: 'executed' },
  variantExecution: { executions: { oracle: { status: 'incomplete', reason: 'prediction_missing' } } } });
assert.deepEqual(gates.adaptive, { status: 'executed', reason: null });
assert.deepEqual(gates.exploratoryReplicas, { status: 'incomplete', reason: 'replica_niche_receipt_missing' });
assert.deepEqual(gates.sequential, { status: 'executed', reason: null });
assert.deepEqual(gates.oracular, { status: 'incomplete', reason: 'prediction_missing' });
assert.deepEqual(gates.factorial, { status: 'missing' });

const missionId = 'nominal-mission';
const baseline = 'a'.repeat(64);
const comparisonProof = { status: 'verified', comparison: { outcome: 'PROMOTE_WORLD', selectedWorld: 1, comparativeAnalysis: {
  adaptiveBudgetExecution: { status: 'executed' } } } };
const promoted = { mission_id: missionId, mission_snapshot_hash: baseline,
  status: 'promoted', decision_json: JSON.stringify({
  outcome: 'PROMOTED', worldNumber: 1, verification: { contentHash: 'sha256:content', claimsCoveredByChecks: true,
    sourceAgentId: 'world-1', integrationChecks: [{ commandId: 'test', passed: true }] },
  agentGit: { objectId: 'signed-object' },
  variantGates: trace.fromComparison(comparisonProof.comparison.comparativeAnalysis)
}) };
const worlds = [1, 2, 3].map((number) => ({ world_number: number, agent_id: `world-${number}`,
  status: number === 1 ? 'promoted' : 'compared', snapshot_hash: baseline,
  workspace_root: require('node:path').resolve(`world-${number}`) }));
const states = ['designed', 'sealed_running', 'sealed_complete', 'cross_examining',
  'decided', 'promotion_preparing', 'promoted'];
const transitions = states.slice(1).map((status, index) => ({ from_status: states[index],
  to_status: status, actor: 'trinity_runtime', evidence_ref: index === 0 ? baseline : null }));
const nominal = { variant: 'adaptive', missionId, experiment: promoted,
  dispatch: { variant_selection_json: JSON.stringify({ variant: 'adaptive',
    experimentalDesign: { ...variants.DEFAULT_DESIGN, ...variants.DEFINITIONS.adaptive.design } }) },
  worlds, transitions, comparisonProof, signedObjectValid: true };
assert.equal(qualification.assess(nominal).qualified, true);
assert.ok(qualification.assess({ ...nominal, comparisonProof: { status: 'missing' } }
).reasons.includes('comparison_journal_not_verified'));
assert.ok(qualification.assess({ ...nominal, comparisonProof: { status: 'verified' } }
).reasons.includes('comparison_journal_not_verified'));
assert.ok(qualification.assess({ ...nominal, comparisonProof: { status: 'verified',
  comparison: { ...comparisonProof.comparison, selectedWorld: 2 } } }
).reasons.includes('promoted_world_not_in_comparison'));
assert.ok(qualification.assess({ ...nominal, comparisonProof: { status: 'verified',
  comparison: { ...comparisonProof.comparison,
    comparativeAnalysis: { adaptiveBudgetExecution: { status: 'incomplete' } } } } }
).reasons.includes('variant_gates_not_durable'));
assert.ok(qualification.assess({ ...nominal, transitions: [] }).reasons.includes('promotion_trace_incomplete'));
assert.ok(qualification.assess({ ...nominal, worlds: worlds.map((world) => ({ ...world, snapshot_hash: null }))
}).reasons.includes('sealed_baseline_mismatch'));
assert.ok(qualification.assess({ ...nominal, worlds: worlds.map((world) => ({ ...world, workspace_root: worlds[0].workspace_root }))
}).reasons.includes('isolated_worlds_not_observed'));
assert.ok(qualification.assess({ ...nominal, signedObjectValid: false }).reasons.includes('signed_candidate_missing'));
assert.ok(qualification.assess({ ...nominal, experiment: { ...promoted, status: 'escalated' } }).reasons.includes('promotion_not_observed'));
assert.ok(qualification.assess({ ...nominal, experiment: { ...promoted,
  decision_json: JSON.stringify({ ...JSON.parse(promoted.decision_json), variantGates: {} }) }
}).reasons.includes('adaptive_gate_not_observed'));
assert.equal(qualification.VARIANTS.length, 12);
assert.ok(qualification.assess({ ...nominal, dispatch: { variant_selection_json: JSON.stringify({
  variant: 'adaptive', experimentalDesign: variants.DEFAULT_DESIGN }) } }).reasons.includes('variant_design_mismatch'));

console.log('Trinity nominal trace: PASS');

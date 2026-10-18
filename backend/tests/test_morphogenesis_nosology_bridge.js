'use strict';

const assert = require('node:assert/strict');
const catalog = require('../../shared/nosology.json');
const evidenceAdapter = require('../src/services/morphogenesis/morphogenesisNosologyEvidence');
const bridge = require('../src/services/morphogenesis/morphogenesisNosologyBridge');
const continuation = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const epochDecision = require('../src/services/morphogenesis/morphogenesisEpochDecisionService');
const missionNosology = require('../src/services/morphogenesis/missionNosologyContext');

function clinicalState(agentId, agentStatus = 'active') {
  return { agentId, agentStatus, updatedAt: '2026-10-18T00:00:00Z',
    inflammatoryIndex: 0.8, pathogenBurden: 0.7, plasmidLoad: 0.2,
    iatrogenicLoad: 0.65, wellnessScore: 0.4, cellCycleState: 'G0',
    vitals: { cognitiveIntegrity: 0.4, energy: 0.3, budgetRatio: 0.2,
      dissonance: 0.75, stress: 0.6, apoptosisRisk: 0 } };
}

function allRustDiagnoses() {
  return catalog.conditions.map((condition) => evidenceAdapter.rustPathology({
    Nosological: { condition: condition.id, severity: 0.75 }
  }, `rust:${condition.id}`));
}

function completeEvidence(parentStatus = 'active') {
  return { status: 'observed', errors: [], states: [clinicalState('orchestrator', parentStatus)],
    pathologies: [{ id: 'node-iatrogenic', agentId: 'orchestrator',
      pathologyType: 'iatrogenic_toxicity', severity: 0.9, confidence: 0.95,
      status: 'confirmed' }, { id: 'node-nosocomial', agentId: 'worker-1',
      pathologyType: 'quarantine_breach', severity: 0.8, confidence: 0.9,
      status: 'confirmed' }],
    rustApplications: [{ agentId: 'orchestrator', sourceRef: 'application:1',
      status: 'applied', treatmentAdministered: true, quarantined: false,
      diagnoses: [...allRustDiagnoses(), evidenceAdapter.rustPathology({
        TherapyAdverseEffect: { therapy: 'ChelationTherapy', marker: 'cofactor_deficit', severity: 0.4 }
      }, 'application:1')] }] };
}

function compile(evidence) {
  return bridge.compileNosologyBridge({ evidence, orchestratorId: 'orchestrator',
    runtimeSignals: { failures: 1 }, state: { results: new Map([['worker-1', {}]]),
      normalizedMission: { missionId: 'mission-1' },
      intraEpochObservations: { attempts: 10, redundant: 6, throttle: { mode: 'throttled' } } } });
}

function testAllFamiliesAndTransverseConceptsReachMorphogenesis() {
  const result = compile(completeEvidence());
  assert.equal(result.schema, 'genos.morphogenesis-nosology/v1');
  assert.deepEqual(result.families.map((family) => family.id), bridge.FAMILIES.map((family) => family[0]));
  assert.ok(result.families.every((family) => family.diagnosticEvidenceCount > 0));
  assert.ok(result.families.some((family) => family.aggregatePressure > family.peakPressure));
  assert.ok(result.families.every((family) => family.contributions.length > 0));
  assert.equal(result.conditionProfiles.filter((item) => catalog.conditions
    .some((condition) => condition.id === item.condition)).length, catalog.conditions.length);
  assert.equal(result.response.recommendations.length, bridge.FAMILIES.length);
  assert.equal(result.projection.calibrationStatus, 'uncalibrated');
  assert.ok(result.transverse.iatrogenicCount >= 2);
  assert.ok(result.transverse.nosocomialCount >= 1);
  assert.equal(result.transverse.treatmentAdministered, 1);
  assert.equal(result.transverse.automaticTherapyAuthorized, false);
  assert.ok(result.proofObligations.some((item) => item.id === 'causal_autopsy'));
  assert.equal(result.response.requiresExplicitAuthorization, true);
}

function testSignalsAndQuarantineGateAreBounded() {
  const observed = compile(completeEvidence());
  const signals = bridge.mergeSignals({ uncertainty: 0.1 }, observed);
  assert.ok(signals.provenanceRisk >= 0.7);
  assert.ok(signals.causalAmbiguity >= 0.7);
  assert.ok(Object.values(signals).filter(Number.isFinite).every((value) => value >= 0 && value <= 1));
  const shadows = bridge.shadowComparison({ uncertainty: 0.1 }, observed);
  assert.deepEqual(Object.keys(shadows).sort(), ['condition_noisy_or_v2', 'family_max_v1',
    'no_change', 'raw_signals']);
  assert.deepEqual(shadows.raw_signals.signals, { uncertainty: 0.1 });
  assert.deepEqual(shadows.no_change.signals, { uncertainty: 0.1 });
  assert.ok(shadows.condition_noisy_or_v2.contributionCount > 0);

  const blocked = compile(completeEvidence('blocked'));
  const policy = bridge.decoratePolicy({ status: 'proposed', diagnosis: { signals },
    decision: { recipe: { candidateId: 'candidate' }, interventionScale: 'COHORT_REPLACEMENT',
      proofObligations: [] }, bounds: { executionAuthorized: false } }, blocked);
  assert.equal(policy.status, 'blocked');
  assert.equal(policy.decision.recipe.candidateId, 'NO_CHANGE');
  assert.equal(policy.bounds.clinicalGate, 'blocked');
  assert.equal(policy.decision.clinicalResponse.therapyAutomatic, false);
}

function testInitialPlanningReceivesNosologyAndHonorsGate() {
  const observed = compile(completeEvidence());
  const input = missionNosology.enrichPlanningInput({ problemProfile: {}, diagnosis: {} }, observed);
  assert.ok(input.problemProfile.provenanceRisk >= 0.7);
  assert.equal(input.nosology.schema, 'genos.morphogenesis-nosology/v1');
  const plan = missionNosology.bindNosology({}, observed);
  assert.equal(plan.clinicalGate, 'clear');
  const blocked = compile(completeEvidence('blocked'));
  assert.throws(() => missionNosology.assertPlanningAllowed(blocked),
    (error) => error.code === 'MORPHOGENESIS_CLINICAL_GATE_BLOCKED');
}

async function testEvidenceAdapterReadsNodeAndRustSurfaces() {
  const db = { all: async (sql) => {
    if (sql.includes('FROM clinical_states')) return [{ agentId: 'orchestrator', agentStatus: 'active',
      vitalsJson: JSON.stringify({ cognitiveIntegrity: 1, energy: 1, budgetRatio: 1,
        dissonance: 0, stress: 0, apoptosisRisk: 0 }), immuneTiter: 1, inflammatoryIndex: 0,
      cellCycleState: 'G0', plasmidLoad: 0, pathogenBurden: 0, iatrogenicLoad: 0,
      wellnessScore: 1, updatedAt: 'now' }];
    if (sql.includes('FROM pathologies')) return [{ agentId: 'orchestrator', id: 'p1',
      pathologyType: 'mutation_drift', severity: 0.8, confidence: 0.9,
      status: 'confirmed', evidenceJson: '[]' }];
    return [{ agentId: 'orchestrator', authorizationId: 'auth-1', operationId: 'op-1',
      resultJson: JSON.stringify({ status: 'applied', treatment_administered: true,
        cell_state_after: { clinical: { is_quarantined: false,
          active_pathologies: [{ Nosological: { condition: 'Hypertension', severity: 0.9 } }] } } }) }];
  } };
  const result = await evidenceAdapter.loadNosologyEvidence({ db, agentIds: ['orchestrator'],
    missionId: 'mission-1', organizationId: 'org-1', projectId: 'project-1' });
  assert.equal(result.status, 'observed');
  assert.equal(result.states.length, 1);
  assert.equal(result.pathologies[0].pathologyType, 'mutation_drift');
  assert.equal(result.rustApplications[0].diagnoses[0].family, 'Cardiovascular');
}

async function testContinuationStopsBeforePlanningWhenParentIsQuarantined() {
  const original = epochDecision.compilePolicy;
  epochDecision.compilePolicy = (input) => ({ policy: bridge.decoratePolicy({ status: 'proposed',
    diagnosis: { signals: {} }, decision: { recipe: { candidateId: 'candidate' },
      proofObligations: [] }, bounds: { executionAuthorized: false } }, input.nosology) });
  try {
    const result = await continuation.planContinuation({ orchestratorId: 'orchestrator', survivors: [],
      continuation: { pool: 100 }, state: { db: {}, organizationId: 'org-1', projectId: 'project-1',
        normalizedMission: { missionId: 'mission-1', prompt: 'Recover safely' },
        results: new Map(), workers: new Map(), plan: { selectedTopology: 'a_team' } } }, {
      loadNosologyEvidence: async () => completeEvidence('blocked')
    });
    assert.equal(result.adapted, false);
    assert.equal(result.reason, 'nosology_quarantine_gate');
    assert.equal(result.decision.policy.status, 'blocked');
  } finally { epochDecision.compilePolicy = original; }
}

async function main() {
  testAllFamiliesAndTransverseConceptsReachMorphogenesis();
  testSignalsAndQuarantineGateAreBounded();
  testInitialPlanningReceivesNosologyAndHonorsGate();
  await testEvidenceAdapterReadsNodeAndRustSurfaces();
  await testContinuationStopsBeforePlanningWhenParentIsQuarantined();
  console.log('Morphogenesis nosology bridge: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

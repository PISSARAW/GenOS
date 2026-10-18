'use strict';

const projection = require('./morphogenesisNosologyProjection');

const FAMILIES = Object.freeze([
  ['autoimmune', 'immunity_recalibration', null],
  ['degenerative', 'local_repair_then_cohort_replacement', 'COHORT_REPLACEMENT'],
  ['infectious', 'quarantine_and_contact_tracing', null],
  ['genetic', 'repair_inherited_source_before_recruitment', null],
  ['cancer', 'circuit_breaker_and_roster_reduction', 'ROSTER_REDUCTION'],
  ['metabolic', 'resource_reallocation', 'RESOURCE_REALLOCATION'],
  ['cardiovascular', 'communication_rerouting', 'COMMUNICATION_REDUCTION'],
  ['psychiatric', 'hypothesis_and_causal_adjudication', null],
  ['environmental', 'environment_isolation_and_recovery', null]
]);
const NODE_PATHOLOGIES = Object.freeze({
  mutation_drift: ['genetic', 'intrinsic'], plasmid_overload: ['infectious', 'intrinsic'],
  immune_exhaustion: ['degenerative', 'intrinsic'], iatrogenic_toxicity: [null, 'iatrogenic'],
  cell_cycle_malignancy: ['cancer', 'intrinsic'], cognitive_metastasis: ['cancer', 'intrinsic'],
  inflammatory_cytokine_storm: ['autoimmune', 'intrinsic'],
  quarantine_breach: ['infectious', 'nosocomial'], senescence_escape: ['cancer', 'intrinsic']
});
const CATEGORY_IDS = Object.freeze({ Autoimmune: 'autoimmune', Degenerative: 'degenerative',
  Infectious: 'infectious', Genetic: 'genetic', Cancer: 'cancer', Metabolic: 'metabolic',
  Cardiovascular: 'cardiovascular', Psychiatric: 'psychiatric', Environmental: 'environmental' });
function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function familyRecord(config) {
  return { id: config[0], pressure: 0, diagnosticEvidenceCount: 0,
    observationalEvidenceCount: 0, evidenceRefs: [], recommendedControl: config[1],
    candidateScale: config[2], peakPressure: 0, aggregatePressure: 0, contributions: [] };
}

function statePressures(state) {
  const vitals = state.vitals || {};
  const cognitiveDeficit = 1 - unit(vitals.cognitiveIntegrity ?? 1);
  const energyDeficit = 1 - unit(vitals.energy ?? 1);
  const budgetDeficit = 1 - unit(vitals.budgetRatio ?? 1);
  return {
    autoimmune: unit(state.inflammatoryIndex),
    degenerative: Math.max(cognitiveDeficit, energyDeficit, state.cellCycleState === 'senescent' ? 1 : 0),
    infectious: Math.max(unit(state.pathogenBurden), unit(state.plasmidLoad)),
    genetic: 0,
    cancer: state.cellCycleState === 'M' ? 1 - unit(state.wellnessScore) : 0,
    metabolic: Math.max(energyDeficit, budgetDeficit), cardiovascular: 0,
    psychiatric: Math.max(unit(vitals.dissonance), unit(vitals.stress), cognitiveDeficit), environmental: 0
  };
}

function operationalPressures(state, runtimeSignals) {
  const observations = state?.intraEpochObservations || {};
  const attempts = Math.max(0, Number(observations.attempts) || 0);
  const redundant = Math.max(0, Number(observations.redundant) || 0);
  const throttled = observations.throttle && observations.throttle.mode !== 'pass';
  return { cardiovascular: Math.max(attempts ? unit(redundant / attempts) : 0, throttled ? 0.8 : 0),
    environmental: unit((Number(runtimeSignals?.failures) || 0) / Math.max(1, state?.results?.size || 1)) };
}

function addEvidence(families, evidence) {
  const family = families.get(evidence.family);
  if (!family) return;
  const pressure = unit(evidence.severity) * unit(evidence.confidence ?? 1);
  family.pressure = Math.max(family.pressure, pressure);
  family.peakPressure = family.pressure;
  family.contributions.push({ pressure, diagnostic: evidence.diagnostic === true,
    condition: evidence.condition || null, pathologyType: evidence.pathologyType || null,
    sourceRef: evidence.sourceRef || null, agentId: evidence.agentId || null });
  family.aggregatePressure = projection.noisyOr(family.contributions.map((item) => item.pressure));
  const key = evidence.diagnostic ? 'diagnosticEvidenceCount' : 'observationalEvidenceCount';
  family[key] += 1;
  if (evidence.sourceRef && !family.evidenceRefs.includes(evidence.sourceRef)) family.evidenceRefs.push(evidence.sourceRef);
}

function addStateEvidence(families, state) {
  const pressures = statePressures(state);
  for (const [family, pressure] of Object.entries(pressures)) {
    if (pressure > 0) addEvidence(families, { family, severity: pressure,
      sourceRef: `clinical-state:${state.agentId}:${state.updatedAt || 'current'}` });
  }
}

function nodeDiagnosis(row) {
  const mapping = NODE_PATHOLOGIES[row.pathologyType] || [null, 'unknown'];
  return { source: 'node', sourceRef: `pathology:${row.id}`, pathologyType: row.pathologyType,
    family: mapping[0], causalClass: mapping[1], severity: unit(row.severity),
    confidence: unit(row.confidence), status: row.status, diagnostic: true, agentId: row.agentId };
}

function rustDiagnoses(evidence) {
  return evidence.rustApplications.flatMap((application) => application.diagnoses.map((diagnosis) => ({
    ...diagnosis, family: CATEGORY_IDS[diagnosis.family] || null,
    diagnostic: true, agentId: application.agentId
  })));
}

function allDiagnoses(evidence) {
  return [...evidence.pathologies.map(nodeDiagnosis), ...rustDiagnoses(evidence)];
}

function addOperationalEvidence(families, state, runtimeSignals) {
  const values = operationalPressures(state, runtimeSignals);
  for (const [family, pressure] of Object.entries(values)) {
    if (pressure > 0) addEvidence(families, { family, severity: pressure,
      sourceRef: `mission-runtime:${state?.normalizedMission?.missionId || 'current'}` });
  }
}

function gateFor(input, evidence) {
  const parent = evidence.states.find((state) => state.agentId === input.orchestratorId);
  const rustParent = evidence.rustApplications.find((item) => item.agentId === input.orchestratorId);
  const blocked = parent?.agentStatus === 'blocked' || rustParent?.quarantined === true;
  const quarantinedAgents = evidence.states.filter((state) => state.agentStatus === 'blocked').map((state) => state.agentId);
  for (const item of evidence.rustApplications.filter((entry) => entry.quarantined)) {
    if (!quarantinedAgents.includes(item.agentId)) quarantinedAgents.push(item.agentId);
  }
  const status = blocked ? 'blocked' : parent || rustParent ? 'clear' : 'unknown';
  return { status, reason: blocked ? 'orchestrator_quarantined' : null,
    orchestratorId: input.orchestratorId || null, quarantinedAgents };
}

function transverseSummary(context) {
  const { evidence, diagnoses, runtimeSignals, gate } = context;
  const iatrogenic = diagnoses.filter((item) => item.causalClass === 'iatrogenic');
  const nosocomial = diagnoses.filter((item) => item.causalClass === 'nosocomial');
  return { runtimePathologyCount: diagnoses.length,
    driftObserved: diagnoses.some((item) => item.pathologyType === 'mutation_drift'),
    failureCount: Number(runtimeSignals?.failures) || 0,
    nosocomialCount: nosocomial.length, iatrogenicCount: iatrogenic.length,
    treatmentApplications: evidence.rustApplications.length,
    treatmentAdministered: evidence.rustApplications.filter((item) => item.treatmentAdministered).length,
    circuitBreakerRecommended: gate.status === 'blocked', immunityMode: 'graded',
    automaticTherapyAuthorized: false, repairOrder: ['containment', 'local_repair', 'authorized_therapy',
      'quiescent_morphogenesis', 'recovery', 'causal_autopsy'] };
}

function obligationsFor(summary, gate) {
  const obligations = [];
  if (summary.runtimePathologyCount) obligations.push({ id: 'post_transition_clinical_recheck', required: true,
    proof: 'nouvelle observation clinique liée au même périmètre après intervention' });
  if (summary.nosocomialCount || summary.iatrogenicCount) obligations.push({ id: 'causal_autopsy', required: true,
    proof: 'filiation causale distinguant environnement, intervention et état antérieur' });
  if (gate.quarantinedAgents.length) obligations.push({ id: 'containment_integrity', required: true,
    proof: 'preuve que les agents quarantainés ne participent ni au dispatch ni à la promotion' });
  return obligations;
}

function primaryFamily(families) {
  return [...families].sort((left, right) => right.pressure - left.pressure)[0] || null;
}

function conditionProfiles(diagnoses) {
  const profiles = new Map();
  for (const diagnosis of diagnoses) {
    const condition = diagnosis.condition || diagnosis.pathologyType;
    if (!condition) continue;
    const key = `${diagnosis.family || 'transverse'}:${condition}`;
    const pressure = unit(diagnosis.severity) * unit(diagnosis.confidence ?? 1);
    const current = profiles.get(key) || { condition, family: diagnosis.family || null,
      peakPressure: 0, aggregatePressure: 0, evidenceCount: 0, evidenceRefs: [], pressures: [] };
    current.peakPressure = Math.max(current.peakPressure, pressure);
    current.pressures.push(pressure);
    current.aggregatePressure = projection.noisyOr(current.pressures);
    current.evidenceCount += 1;
    if (diagnosis.sourceRef && !current.evidenceRefs.includes(diagnosis.sourceRef)) {
      current.evidenceRefs.push(diagnosis.sourceRef);
    }
    profiles.set(key, current);
  }
  return [...profiles.values()].map(({ pressures, ...profile }) => profile)
    .sort((left, right) => right.aggregatePressure - left.aggregatePressure);
}

function familyRecommendations(families) {
  return families.filter((family) => family.aggregatePressure > 0)
    .sort((left, right) => right.aggregatePressure - left.aggregatePressure)
    .map((family) => ({ family: family.id, pressure: family.aggregatePressure,
      recommendedControl: family.recommendedControl, candidateScale: family.candidateScale,
      evidenceRefs: [...family.evidenceRefs] }));
}

function compileNosologyBridge(input = {}) {
  const evidence = input.evidence || { status: 'unavailable', states: [], pathologies: [], rustApplications: [] };
  const families = new Map(FAMILIES.map((config) => [config[0], familyRecord(config)]));
  evidence.states.forEach((state) => addStateEvidence(families, state));
  addOperationalEvidence(families, input.state, input.runtimeSignals);
  const diagnoses = allDiagnoses(evidence);
  diagnoses.forEach((diagnosis) => addEvidence(families, diagnosis));
  const familyList = [...families.values()];
  const conditions = conditionProfiles(diagnoses);
  const gate = gateFor(input, evidence);
  const transverse = transverseSummary({ evidence, diagnoses, runtimeSignals: input.runtimeSignals, gate });
  const primary = primaryFamily(familyList);
  const recommendations = familyRecommendations(familyList);
  return { schema: 'genos.morphogenesis-nosology/v1', status: evidence.status,
    families: familyList, diagnoses, conditionProfiles: conditions, transverse, gate,
    projection: { schema: 'genos.nosology-projection/v2', defaultMode: 'family_max_v1',
      candidateMode: 'condition_noisy_or_v2', calibrationStatus: 'uncalibrated',
      promotionRequiresVerifiedCampaign: true },
    response: { primaryFamily: primary?.pressure > 0 ? primary.id : null,
      recommendedControl: primary?.pressure > 0 ? primary.recommendedControl : 'no_change',
      candidateScale: primary?.pressure > 0 ? primary.candidateScale : null,
      recommendations, activeConditions: conditions,
      therapyAutomatic: false, requiresExplicitAuthorization: true },
    proofObligations: obligationsFor(transverse, gate), errors: evidence.errors || [] };
}

function projectSignals(base = {}, bridge = {}, mode = 'family_max_v1') {
  return projection.project(base, bridge, mode);
}

function mergeSignals(base = {}, bridge = {}, mode = 'family_max_v1') {
  return projectSignals(base, bridge, mode).signals;
}

function uniqueObligations(existing, additional) {
  const byId = new Map((existing || []).map((item) => [item.id, item]));
  for (const item of additional || []) byId.set(item.id, item);
  return [...byId.values()];
}

function noChangeRecipe(policy) {
  return { candidateId: 'NO_CHANGE', topology: policy.decision?.recipe?.topology || null,
    variant: policy.decision?.recipe?.variant || null, kind: 'NO_CHANGE',
    interventionScale: 'NO_CHANGE', executionEligible: false };
}

function decoratePolicy(policy, bridge, projectionReceipt = null) {
  if (!bridge) return policy;
  const obligations = uniqueObligations(policy.decision?.proofObligations, bridge.proofObligations);
  const decision = { ...policy.decision, proofObligations: obligations,
    clinicalResponse: bridge.response, nosologyProjection: projectionReceipt };
  const result = { ...policy, diagnosis: { ...policy.diagnosis, nosology: bridge }, decision,
    bounds: { ...policy.bounds, clinicalGate: bridge.gate.status } };
  if (bridge.gate.status !== 'blocked' && !projectionReceipt?.abstain) return result;
  result.status = 'blocked';
  result.decision = { ...decision, recipe: noChangeRecipe(policy), interventionScale: 'NO_CHANGE',
    interventionEstimate: null };
  if (projectionReceipt?.abstain && bridge.gate.status !== 'blocked') result.status = policy.status;
  return result;
}

module.exports = { FAMILIES, compileNosologyBridge, projectSignals, mergeSignals, decoratePolicy,
  shadowComparison: projection.shadowComparison };

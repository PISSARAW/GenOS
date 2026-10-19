'use strict';

const { randomUUID } = require('node:crypto');
const { fingerprint } = require('./stateFingerprint');

const CANDIDATES = [
  { id: 'no_change', hypothesisId: 'h-control', action: 'observe_without_change',
    role: 'control', reversible: true, blastRadius: 'none' },
  { id: 'rollback', hypothesisId: 'h-deployment', action: 'rollback_release',
    role: 'coagulation', reversible: true, blastRadius: 'release' },
  { id: 'minimal_fix', hypothesisId: 'h-local-regression', action: 'apply_minimal_fix',
    role: 'cicatrisation', reversible: true, blastRadius: 'component' },
  { id: 'structural_fix', hypothesisId: 'h-systemic-defect', action: 'apply_structural_fix',
    role: 'cicatrisation', reversible: false, blastRadius: 'system' }
];

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw Object.assign(new TypeError(code), { code });
  }
  return value.trim();
}

function ratio(value, threshold) {
  if (threshold === 0) return value > 0 ? Number.POSITIVE_INFINITY : 1;
  return value / threshold;
}

function severityFor(metrics, policy) {
  const pressure = Math.max(ratio(metrics.errorRate, policy.maxErrorRate),
    ratio(metrics.averageLatencyMs, policy.maxAverageLatencyMs));
  if (pressure >= 4) return 'critical';
  if (pressure >= 2) return 'high';
  if (pressure >= 1.25) return 'medium';
  return 'low';
}

function hypotheses(policy) {
  const target = `error<=${policy.maxErrorRate};latency<=${policy.maxAverageLatencyMs}`;
  return [
    { id: 'h-control', statement: 'La degradation persiste sans intervention.',
      prediction: 'Les mesures restent hors SLO.', falsification: `Les mesures satisfont ${target}.` },
    { id: 'h-deployment', statement: 'Le deploiement courant cause la degradation.',
      prediction: 'Le rollback restaure le SLO.', falsification: 'Le rollback ne restaure pas le SLO.' },
    { id: 'h-local-regression', statement: 'Une regression locale cause la degradation.',
      prediction: 'Une correction minimale restaure le SLO.',
      falsification: 'La correction minimale ne restaure pas le SLO.' },
    { id: 'h-systemic-defect', statement: 'Un defaut structurel cause la degradation.',
      prediction: 'La correction structurelle restaure durablement le SLO.',
      falsification: 'La correction structurelle echoue ou regresse.' }
  ];
}

function candidateContracts() {
  return CANDIDATES.map(candidate => ({ ...candidate, executionAuthorized: false,
    evidenceRequired: ['isolated-execution-receipt', 'slo-measurements',
      'independent-verifier-quorum'] }));
}

function validNosologyCandidate(candidate) {
  const identifier = /^[a-z][a-z0-9_]{0,63}$/;
  return identifier.test(candidate?.id || '') && identifier.test(candidate?.action || '')
    && candidate.executionAuthorized === false;
}

function validPlanCandidates(plan) {
  const families = new Set(['autoimmune', 'degenerative', 'infectious', 'genetic', 'cancer',
    'metabolic', 'cardiovascular', 'psychiatric', 'environmental']);
  const scales = new Set(['COHORT_REPLACEMENT', 'ROSTER_REDUCTION', 'RESOURCE_REALLOCATION',
    'COMMUNICATION_REDUCTION', 'LOCAL_REPAIR', null]);
  const ids = plan.candidates.map((candidate) => candidate.id);
  return new Set(ids).size === ids.length && plan.candidates.every((candidate) =>
    validNosologyCandidate(candidate) && (candidate.family === null || families.has(candidate.family))
      && (candidate.scale === undefined || scales.has(candidate.scale)));
}

function validNosologyEnvelope(plan) {
  const families = ['autoimmune', 'degenerative', 'infectious', 'genetic', 'cancer',
    'metabolic', 'cardiovascular', 'psychiatric', 'environmental'];
  const scales = ['COHORT_REPLACEMENT', 'ROSTER_REDUCTION', 'RESOURCE_REALLOCATION',
    'COMMUNICATION_REDUCTION', null];
  return plan?.schema === 'genos.shev-morphogenesis-healing-plan/v1'
    && plan.requiresExplicitAuthorization === true && plan.promotionEligible === false
    && families.includes(plan.primaryFamily) && typeof plan.recommendedControl === 'string'
    && plan.recommendedControl.length <= 128 && scales.includes(plan.candidateScale);
}

function validPlanCandidateList(plan) {
  return Array.isArray(plan?.candidates) && plan.candidates.length > 0
    && plan.candidates.length <= 10 && validPlanCandidates(plan);
}

function validPlanObligations(plan) {
  return Array.isArray(plan?.proofObligations) && plan.proofObligations.length <= 32;
}

function validNosologyPlan(plan) {
  return validNosologyEnvelope(plan) && validPlanCandidateList(plan)
    && validPlanObligations(plan);
}

function planFor(context, nosologyPlan = null) {
  const severity = severityFor(context.metrics, context.policy);
  const investigators = ['critical', 'high'].includes(severity) ? 3 : 2;
  const morphCandidates = validNosologyPlan(nosologyPlan) ? nosologyPlan.candidates : [];
  const plan = { schema: 'genos.production-healing-plan/v1',
    sourceObservationId: context.observation.id, evidenceDigest: context.window.evidence_digest,
    thresholds: context.policy, hypotheses: hypotheses(context.policy),
    candidates: [...candidateContracts(), ...morphCandidates],
    nosology: morphCandidates.length ? { primaryFamily: nosologyPlan.primaryFamily,
      recommendedControl: nosologyPlan.recommendedControl,
      candidateScale: nosologyPlan.candidateScale,
      proofObligations: nosologyPlan.proofObligations } : null, stages: {
      nociception: { observationId: context.observation.id, status: 'observed' },
      inflammation: { investigators, maxCandidateExecutions: CANDIDATES.length },
      coagulation: { candidateId: 'rollback', automaticExecution: false },
      cicatrisation: { candidateIds: ['minimal_fix', 'structural_fix'], status: 'unverified' },
      scar: { status: 'pending_canary' }
    }, authorizesProductionChange: false };
  return { severity, plan, planHash: fingerprint(plan) };
}

async function sourceContext(db, input) {
  const observation = await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, input.observationId]);
  if (!observation || observation.kind !== 'degradation'
    || observation.epistemic_status !== 'observed') {
    throw Object.assign(new Error('A current observed production degradation is required.'),
      { code: 'PRODUCTION_HEALING_OBSERVATION_REQUIRED' });
  }
  if (observation.valid_until && Date.parse(observation.valid_until) <= Date.now()) {
    throw Object.assign(new Error('Production degradation evidence is stale.'),
      { code: 'PRODUCTION_HEALING_OBSERVATION_STALE' });
  }
  const window = await db.get(`SELECT * FROM production_telemetry_observations
    WHERE project_id = ? AND observation_id = ?`, [input.projectId, input.observationId]);
  if (!window) throw Object.assign(new Error('Production telemetry window is missing.'),
    { code: 'PRODUCTION_HEALING_WINDOW_REQUIRED' });
  return { observation, window, metrics: JSON.parse(window.metrics_json),
    policy: JSON.parse(window.policy_json) };
}

async function createCampaign(db, input) {
  const scope = { organizationId: requiredText(input?.organizationId,
    'PRODUCTION_HEALING_ORGANIZATION_REQUIRED'), projectId: requiredText(input?.projectId,
    'PRODUCTION_HEALING_PROJECT_REQUIRED'), producerId: requiredText(input?.producerId,
    'PRODUCTION_HEALING_PRODUCER_REQUIRED'), observationId: requiredText(input?.observationId,
    'PRODUCTION_HEALING_OBSERVATION_REQUIRED') };
  const existing = await db.get(`SELECT * FROM production_healing_campaigns
    WHERE organization_id = ? AND project_id = ? AND observation_id = ?`,
  [scope.organizationId, scope.projectId, scope.observationId]);
  if (existing) return campaignView(existing, true);
  const context = await sourceContext(db, scope);
  const planned = planFor(context, input.nosologyPlan);
  const id = `healing-${randomUUID()}`;
  await db.run(`INSERT INTO production_healing_campaigns
    (id,organization_id,project_id,observation_id,producer_id,severity,status,plan_json,plan_hash)
    VALUES(?,?,?,?,?,?,'planned',?,?)`, [id, scope.organizationId, scope.projectId,
    scope.observationId, scope.producerId, planned.severity,
    JSON.stringify(planned.plan), planned.planHash]);
  return campaignView(await db.get('SELECT * FROM production_healing_campaigns WHERE id = ?', id));
}

function campaignView(row, replayed = false) {
  return { id: row.id, organizationId: row.organization_id, projectId: row.project_id,
    observationId: row.observation_id, producerId: row.producer_id,
    severity: row.severity, status: row.status, plan: JSON.parse(row.plan_json),
    planHash: row.plan_hash, selectedCandidateId: row.selected_candidate_id,
    rolloutId: row.rollout_id, scar: row.scar_json ? JSON.parse(row.scar_json) : null,
    replayed, authorizesProductionChange: false };
}

module.exports = { createCampaign, campaignView, planFor, severityFor };

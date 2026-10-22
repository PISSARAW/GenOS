'use strict';

const store = require('./shreCaseStore');
const policy = require('./shrePolicy');
const actuators = require('./shreActuatorRegistry');
const causalVerifier = require('./causalRemediationVerifier');

const STATES = Object.freeze(['DIAGNOSTIC', 'PLAN', 'SIMULATION', 'AUTHORIZATION', 'APPLICATION',
  'APPLICATION_PENDING', 'APPLICATION_UNCERTAIN', 'COUNTER_TEST', 'COUNTER_TEST_FAILED',
  'CAUSAL_VERIFICATION', 'CLOSED', 'ROLLED_BACK']);

function requiredText(value, code, max = 512) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim().slice(0, max);
}

function evidenceRefs(value, code) {
  const refs = Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.trim()))] : [];
  if (!refs.length) throw new Error(code);
  return refs.slice(0, 50);
}

function requireState(current, expected) {
  if (current.status !== expected) throw new Error(`SHRE_INVALID_TRANSITION_${current.status}_TO_${expected}`);
}

function appendEvent(current, state, event) {
  current.status = state;
  current.timeline.push({ state, at: new Date().toISOString(), detail: event.detail,
    evidenceRefs: event.evidenceRefs || [] });
}

async function createDiagnostic(db, tenant, input) {
  const context = await store.load(db, tenant);
  const caseId = store.createId();
  const diagnostic = { evidenceRefs: evidenceRefs(input?.evidenceRefs, 'SHRE_DIAGNOSTIC_EVIDENCE_REQUIRED'),
    probableCause: requiredText(input?.probableCause, 'SHRE_PROBABLE_CAUSE_REQUIRED'),
    uncertainty: finiteScore(input?.uncertainty, 'SHRE_UNCERTAINTY_INVALID'),
    riskScore: finiteScore(input?.riskScore, 'SHRE_RISK_SCORE_INVALID'),
    resourceId: requiredText(input?.resourceId, 'SHRE_RESOURCE_REQUIRED', 128),
    actuatorId: requiredText(input?.actuatorId, 'SHRE_ACTUATOR_REQUIRED', 128),
    verifierId: requiredText(input?.verifierId, 'SHRE_VERIFIER_REQUIRED', 128),
    causalVerifierId: requiredText(input?.causalVerifierId, 'SHRE_CAUSAL_VERIFIER_REQUIRED', 128),
    sourceDigest: requiredText(input?.sourceDigest, 'SHRE_SOURCE_DIGEST_REQUIRED', 256),
    createdBy: requiredText(input?.createdBy, 'SHRE_ACTOR_REQUIRED', 128) };
  const current = { caseId, status: 'DIAGNOSTIC', diagnostic, timeline: [], createdAt: new Date().toISOString() };
  appendEvent(current, 'DIAGNOSTIC', { detail: 'Diagnostic enregistré', evidenceRefs: diagnostic.evidenceRefs });
  context.state.cases[caseId] = current;
  await store.save(context);
  return current;
}

function finiteScore(value, code) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error(code);
  return score;
}

function requiredImpactLevel(value) {
  const impact = requiredText(value, 'SHRE_SIMULATION_IMPACT_LEVEL_REQUIRED', 32);
  if (!['low', 'medium', 'high', 'critical'].includes(impact)) throw new Error('SHRE_SIMULATION_IMPACT_LEVEL_INVALID');
  return impact;
}

async function plan(db, tenant, caseId, input) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  requireState(current, 'DIAGNOSTIC');
  const impactLevel = requiredText(input?.impactLevel, 'SHRE_IMPACT_LEVEL_REQUIRED', 32);
  if (!['low', 'medium', 'high', 'critical'].includes(impactLevel)) throw new Error('SHRE_IMPACT_LEVEL_INVALID');
  current.plan = { minimalChange: requiredText(input?.minimalChange, 'SHRE_MINIMAL_CHANGE_REQUIRED'),
    expectedImpact: requiredText(input?.expectedImpact, 'SHRE_EXPECTED_IMPACT_REQUIRED'),
    rollbackPlan: requiredText(input?.rollbackPlan, 'SHRE_ROLLBACK_PLAN_REQUIRED'),
    changeScope: causalVerifier.normalizeChangeScope(input, current.diagnostic.resourceId),
    impactLevel, evidenceRefs: evidenceRefs(input?.evidenceRefs, 'SHRE_PLAN_EVIDENCE_REQUIRED') };
  appendEvent(current, 'PLAN', { detail: 'Plan minimal enregistré', evidenceRefs: current.plan.evidenceRefs });
  await store.save(context);
  return current;
}

async function simulate(db, tenant, caseId) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  requireState(current, 'PLAN');
  const actuator = actuators.getActuator(current.diagnostic.actuatorId);
  const result = await actuator.simulate({ caseId, diagnostic: current.diagnostic, plan: current.plan, tenant });
  if (result?.isolated !== true || result?.network !== 'disabled'
      || result?.sourceDigest !== current.diagnostic.sourceDigest) {
    throw new Error('SHRE_SIMULATION_ISOLATION_REQUIRED');
  }
  current.simulation = { environmentId: requiredText(result.environmentId, 'SHRE_SIMULATION_ENVIRONMENT_REQUIRED', 128),
    evidenceRefs: evidenceRefs(result.evidenceRefs, 'SHRE_SIMULATION_EVIDENCE_REQUIRED'),
    predictedImpact: requiredText(result.predictedImpact, 'SHRE_SIMULATION_IMPACT_REQUIRED'),
    riskScore: finiteScore(result.riskScore, 'SHRE_SIMULATION_RISK_INVALID'),
    impactLevel: requiredImpactLevel(result.impactLevel),
    passed: result.passed === true };
  appendEvent(current, 'SIMULATION', { detail: 'Simulation isolée terminée', evidenceRefs: current.simulation.evidenceRefs });
  await store.save(context);
  return current;
}

async function authorize(db, tenant, caseId, input) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  requireState(current, 'SIMULATION');
  if (!current.simulation.passed) throw new Error('SHRE_SIMULATION_MUST_PASS');
  const humanRequired = policy.requiresHumanApproval(current.diagnostic, current.plan, current.simulation);
  const approval = input?.humanApproval;
  if (humanRequired && (!approval?.approved || !approval.approverId || !approval.evidenceRef)) {
    throw new Error('SHRE_HUMAN_APPROVAL_REQUIRED');
  }
  if (humanRequired && approval.approverId === current.diagnostic.createdBy) {
    throw new Error('SHRE_INDEPENDENT_APPROVER_REQUIRED');
  }
  const refs = [...current.simulation.evidenceRefs];
  if (humanRequired) refs.push(requiredText(approval.evidenceRef, 'SHRE_APPROVAL_EVIDENCE_REQUIRED', 512));
  current.authorization = { humanRequired, approverId: humanRequired ? requiredText(approval.approverId,
    'SHRE_APPROVER_REQUIRED', 128) : null, evidenceRefs: refs,
    permission: policy.grantPermission({ resourceId: current.diagnostic.resourceId }) };
  appendEvent(current, 'AUTHORIZATION', { detail: humanRequired ? 'Politique et approbation humaine satisfaites' : 'Autorisé par politique déterministe', evidenceRefs: refs });
  await store.save(context);
  return current;
}

async function apply(db, tenant, caseId) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  requireState(current, 'AUTHORIZATION');
  const permit = current.authorization.permission;
  if (!policy.permissionValid(permit, current.diagnostic.resourceId)) throw new Error('SHRE_TEMPORARY_PERMISSION_EXPIRED');
  const actuator = actuators.getActuator(current.diagnostic.actuatorId);
  appendEvent(current, 'APPLICATION_PENDING', { detail: 'Application confiée à l’actionneur', evidenceRefs: [] });
  await store.save(context);
  let result;
  try {
    result = await actuator.apply({ caseId, resourceId: current.diagnostic.resourceId,
      change: current.plan.minimalChange, temporaryPermission: permit, tenant });
  } catch (error) {
    current.application = { applied: null, uncertain: true, actuatorId: actuator.id,
      error: String(error.message || 'actuator-error').slice(0, 256), appliedAt: new Date().toISOString() };
    appendEvent(current, 'APPLICATION_UNCERTAIN', { detail: 'Réponse de l’actionneur absente; vérification ou rollback requis' });
    await store.save(context);
    throw error;
  }
  current.application = { applied: result?.applied === true,
    evidenceRefs: evidenceRefs(result?.evidenceRefs, 'SHRE_APPLICATION_EVIDENCE_REQUIRED'),
    actuatorId: actuator.id, appliedAt: new Date().toISOString() };
  if (!current.application.applied || result?.permissionConsumed !== true) {
    current.application.uncertain = true;
    appendEvent(current, 'APPLICATION_UNCERTAIN', { detail: 'Action ou permis non confirmé; vérification ou rollback requis',
      evidenceRefs: current.application.evidenceRefs });
    await store.save(context);
    throw new Error('SHRE_APPLICATION_OR_PERMISSION_NOT_CONFIRMED');
  }
  current.authorization.permission.consumed = true;
  appendEvent(current, 'APPLICATION', { detail: 'Actionneur a confirmé l’application', evidenceRefs: current.application.evidenceRefs });
  await store.save(context);
  return current;
}

async function counterTest(db, tenant, caseId) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  if (!['APPLICATION', 'APPLICATION_PENDING', 'APPLICATION_UNCERTAIN'].includes(current.status)) {
    requireState(current, 'APPLICATION');
  }
  const actuator = actuators.getActuator(current.diagnostic.actuatorId);
  const verifier = actuators.getVerifier(current.diagnostic.verifierId);
  if (verifier.id === actuator.id) throw new Error('SHRE_INDEPENDENT_COUNTER_TEST_REQUIRED');
  const result = await verifier.counterTest({ caseId, resourceId: current.diagnostic.resourceId,
    plan: current.plan, actuatorId: actuator.id, tenant });
  current.counterTest = { effectObserved: result?.effectObserved === true,
    changeAttributed: result?.changeAttributed === true,
    noRegression: result?.noRegression === true,
    verifierId: requiredText(result?.verifierId, 'SHRE_INDEPENDENT_VERIFIER_REQUIRED', 128),
    evidenceRefs: evidenceRefs(result?.evidenceRefs, 'SHRE_COUNTER_TEST_EVIDENCE_REQUIRED') };
  if (current.counterTest.verifierId !== verifier.id) throw new Error('SHRE_INDEPENDENT_VERIFIER_ID_MISMATCH');
  if (!current.counterTest.effectObserved || !current.counterTest.changeAttributed || !current.counterTest.noRegression) {
    appendEvent(current, 'COUNTER_TEST_FAILED', { detail: 'Contre-test en échec; rollback requis', evidenceRefs: current.counterTest.evidenceRefs });
    current.status = 'COUNTER_TEST_FAILED';
  } else appendEvent(current, 'COUNTER_TEST', { detail: 'Effet observé sans régression', evidenceRefs: current.counterTest.evidenceRefs });
  await store.save(context);
  return current;
}

async function verifyCausalRemediation(db, tenant, caseId) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  if (!['COUNTER_TEST', 'CAUSAL_VERIFICATION'].includes(current.status)) {
    throw new Error('SHRE_CAUSAL_VERIFICATION_REQUIRES_COUNTER_TEST');
  }
  requireSuccessfulCounterTest(current);
  current.causalVerification = await causalVerifier.verify({ caseRecord: current, tenant });
  const refs = current.causalVerification.evidenceRefs.map((item) => item.id);
  appendEvent(current, 'CAUSAL_VERIFICATION', { detail: `Vérification indépendante: ${current.causalVerification.status}`,
    evidenceRefs: refs });
  await store.save(context);
  return current;
}

function requireSuccessfulCounterTest(current) {
  if (current.application?.applied !== true || current.application?.uncertain === true
    || !current.counterTest?.effectObserved || !current.counterTest?.changeAttributed || !current.counterTest?.noRegression
    || current.counterTest.verifierId === current.diagnostic.actuatorId) {
    throw new Error('SHRE_INDEPENDENT_COUNTER_TEST_REQUIRED');
  }
}

async function close(db, tenant, caseId, input) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  const abandonable = ['DIAGNOSTIC', 'PLAN', 'SIMULATION', 'AUTHORIZATION'].includes(current.status);
  const causalPass = current.status === 'CAUSAL_VERIFICATION' && current.causalVerification?.status === 'PASS';
  if (!abandonable && !causalPass) throw new Error('SHRE_CAUSAL_VERIFICATION_REQUIRED');
  if (abandonable && !input?.abandon) throw new Error('SHRE_PRE_APPLICATION_CLOSE_REQUIRES_ABANDON');
  const archivedEvidenceRefs = [...(current.diagnostic?.evidenceRefs || []), ...(current.plan?.evidenceRefs || []),
    ...(current.simulation?.evidenceRefs || []), ...(current.authorization?.evidenceRefs || []),
    ...(current.application?.evidenceRefs || []), ...(current.counterTest?.evidenceRefs || []),
    ...(current.causalVerification?.evidenceRefs || []).map((item) => item.id)];
  if (abandonable) archivedEvidenceRefs.push(...evidenceRefs(input?.evidenceRefs, 'SHRE_ABANDON_EVIDENCE_REQUIRED'));
  current.closure = { decision: requiredText(input?.decision, 'SHRE_CLOSURE_DECISION_REQUIRED', 128),
    archivedEvidenceRefs };
  appendEvent(current, 'CLOSED', { detail: current.closure.decision, evidenceRefs: archivedEvidenceRefs });
  await store.save(context);
  return current;
}

async function rollback(db, tenant, caseId, input) {
  const context = await store.load(db, tenant);
  const current = store.requireCase(context.state, caseId);
  if (!['APPLICATION', 'APPLICATION_PENDING', 'APPLICATION_UNCERTAIN', 'COUNTER_TEST_FAILED', 'CAUSAL_VERIFICATION'].includes(current.status)) {
    throw new Error('SHRE_ROLLBACK_NOT_ALLOWED');
  }
  const actuator = actuators.getActuator(current.diagnostic.actuatorId);
  const result = await actuator.rollback({ caseId, resourceId: current.diagnostic.resourceId,
    rollbackPlan: current.plan.rollbackPlan, reason: requiredText(input?.reason, 'SHRE_ROLLBACK_REASON_REQUIRED'), tenant });
  if (result?.rolledBack !== true) throw new Error('SHRE_ROLLBACK_NOT_CONFIRMED');
  const refs = evidenceRefs(result.evidenceRefs, 'SHRE_ROLLBACK_EVIDENCE_REQUIRED');
  current.rollback = { reason: input.reason, evidenceRefs: refs };
  current.closure = { decision: 'rolled_back', archivedEvidenceRefs: [...current.diagnostic.evidenceRefs,
    ...current.plan.evidenceRefs, ...current.simulation.evidenceRefs, ...(current.application?.evidenceRefs || []),
    ...(current.counterTest?.evidenceRefs || []), ...(current.causalVerification?.evidenceRefs || []).map((item) => item.id), ...refs] };
  appendEvent(current, 'ROLLED_BACK', { detail: 'Rollback confirmé par l’actionneur', evidenceRefs: refs });
  await store.save(context);
  return current;
}

async function getCase(db, tenant, caseId) {
  const context = await store.load(db, tenant);
  return store.requireCase(context.state, caseId);
}

module.exports = { STATES, createDiagnostic, plan, simulate, authorize, apply, counterTest,
  verifyCausalRemediation, close, rollback, getCase };

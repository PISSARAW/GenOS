'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { memoryDb } = require('../ontogenesisFixture');
const projectStore = require('../../src/services/ontogenesis/projectStore');
const shev = require('../../src/services/shev/responsibilityService');
const worktrees = require('../../src/services/ontogenesis/worktreeService');
const ledger = require('../../src/services/ambientAgency/responsibilityLedgerService');
const observations = require('../../src/services/ambientAgency/observationService');
const arbitration = require('../../src/services/ambientAgency/arbitrationService');
const feedback = require('../../src/services/ambientAgency/feedbackLearningService');
const goals = require('../../src/services/gvxGoalSelector');
const plans = require('../../src/services/ontogenesis/asyncDelegationPlanService');
const runtime = require('../../src/services/ontogenesis/asyncDelegationRuntimeService');
const decisions = require('../../src/services/ontogenesis/asyncDelegationDecisionService');

const SCOPE = Object.freeze({ organizationId: 'org-stewardship-q', projectId: 'project-stewardship-q' });
const RESPONSIBILITY_ID = 'ambient-stewardship-q';

function responsibilityPayload() {
  return {
    responsibilityId: RESPONSIBILITY_ID, ownerAgentId: 'steward-owner',
    mandateRef: 'mandate:stewardship-q', consentRef: 'consent:stewardship-q',
    objectiveRef: 'objective:retention', externalTrajectoryRef: 'trajectory:retention',
    purpose: 'Qualifier une trajectoire sans promotion automatique',
    policy: { allowedApps: ['project-monitor'], allowedFields: ['gap', 'sampleId'] },
    recordedAt: '2026-10-20T08:00:00.000Z'
  };
}

async function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-stewardship-q-'));
  const filename = path.join(root, 'qualification.db');
  const db = await memoryDb(filename);
  await projectStore.createProject(db, { id: SCOPE.projectId, rootPath: root,
    branch: 'codex/stewardship-q', objective: 'Qualifier Q1 et Q2' });
  await shev.registerResponsibility(db, { projectId: SCOPE.projectId,
    authorityRef: 'authority:stewardship-q', mandate: {
      purpose: 'Verifier effet projet et apprentissage', autoDiagnose: false,
      autoInstrument: false, dimensions: [{ name: 'retention', expected: 'improved',
        acceptance: ['independent-effect-proof', 'independent-learning-proof'] }]
    } });
  await db.run("UPDATE shev_responsibilities SET stage='delegated' WHERE project_id=?", SCOPE.projectId);
  await ledger.create(db, { ...SCOPE, payload: responsibilityPayload() });
  return { db, filename, root, scope: { ...SCOPE }, responsibilityId: RESPONSIBILITY_ID };
}

function trajectory(overrides = {}) {
  return { ref: 'trajectory:retention', current: 70, target: 80,
    direction: 'MAXIMIZE', tolerance: 2, effectEvidenceRefs: ['metric:retention:baseline'],
    ...overrides };
}

function signals(observationRef) {
  const values = { projectNeed: 0.9, trajectoryGap: 0.9, risk: 0.5,
    opportunity: 0.7, uncertainty: 0.2, learningProgress: 0.4 };
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name,
    { value, sourceRefs: [observationRef] }]));
}

function goalCandidate(observationRef) {
  return { goalId: 'retention-repair', estimatedCost: 2,
    signals: signals(observationRef),
    provenance: { candidateRef: `candidate:${observationRef}`,
      observedAt: '2026-10-20T08:05:00.000Z' } };
}

async function observe(ctx, input, responsibility) {
  if (responsibility.status !== 'ACTIVE') return null;
  const result = await observations.ingest(ctx.db, { ...ctx.scope,
    responsibilityId: ctx.responsibilityId, observationId: `observation-${input.cycleId}`,
    sourceApp: 'project-monitor', sourceRef: `monitor:${input.cycleId}`,
    consentRef: responsibility.consentRef,
    provenance: { collectorId: 'collector-independent', permissionRef: responsibility.consentRef },
    payload: { gap: input.trajectory.current, sampleId: input.cycleId, ignored: 'discarded' },
    observedAt: '2026-10-20T08:05:00.000Z' });
  return result.record;
}

function arbitrate(input, responsibility, observation) {
  return arbitration.arbitrate({ responsibility, responsibilityVersion: responsibility.version,
    trajectory: input.trajectory, observation, proposerId: 'planner-independent',
    verification: observation && input.includeVerification !== false ? {
      verifierId: 'verifier-independent', verdict: 'SUPPORTED',
      subjectRef: observation.observationId, evidenceRefs: [`evidence:${observation.observationId}`]
    } : null,
    authority: { authorityId: 'authority-independent', disposition: 'AUTHORIZED',
      responsibilityVersion: responsibility.version } });
}

function dossier(input, decision) {
  return { schema: 'genos.stewardship-qualification/v1', cycleId: input.cycleId,
    stages: ['responsibility', 'observation', 'arbitration'], decision,
    promotionAuthorized: false };
}

async function selectGoal(ctx, input, observation) {
  return goals.selectGoals({ scope: ctx.scope,
    candidates: input.candidates || [goalCandidate(observation.observationId)],
    maxCost: 10, maxGoals: 1, minUtility: 0.1, noChangeUtility: input.noChangeUtility || 0,
    authority: { isAllowed: async () => true } });
}

function capsuleFor(ctx, missionId) {
  const project = { id: ctx.scope.projectId, root_path: ctx.root };
  const capsule = path.join(worktrees.managedRoot(project), 'capsules', missionId);
  fs.mkdirSync(capsule, { recursive: true });
  return capsule;
}

async function startQualification(ctx, overrides = {}) {
  const input = { ...overrides, cycleId: overrides.cycleId || 'cycle-1',
    trajectory: trajectory(overrides.trajectory) };
  const responsibility = await ledger.current(ctx.db, { ...ctx.scope,
    responsibilityId: ctx.responsibilityId });
  const observation = await observe(ctx, input, responsibility);
  const decision = arbitrate(input, responsibility, observation);
  const evidence = dossier(input, decision);
  if (decision.decision !== 'PROPOSE_ACTION') return { evidence, observation };
  const selection = await selectGoal(ctx, input, observation);
  evidence.stages.push('gvx_selection');
  evidence.selection = selection;
  if (selection.decision === 'NO_CHANGE') {
    evidence.decision = { decision: 'NO_CHANGE', reason: 'GVX_NO_CHANGE' };
    return { evidence, observation, selection };
  }
  const missionId = overrides.missionId || `mission-${input.cycleId}`;
  const mission = await plans.deriveDelegation(ctx.db, { missionId,
    projectId: ctx.scope.projectId, producerId: 'worker-producer',
    capsulePath: capsuleFor(ctx, missionId), baseRevision: 'base-revision' });
  evidence.stages.push('delegation');
  return { evidence, observation, selection, mission };
}

function stepData(sequence) {
  return [
    { stepId: 'scope', state: { inspected: true }, evidenceRefs: ['evidence:scope'] },
    { stepId: 'execute_isolated', state: { revision: 'candidate-revision' },
      evidenceRefs: ['evidence:execution'], artifactRef: 'artifact:candidate' },
    { stepId: 'independent_verify', state: { verifierId: 'verifier-final',
      verdict: 'accepted', candidateRevision: 'candidate-revision' },
    evidenceRefs: ['evidence:independent-verification'] },
    { stepId: 'post_integration_effect', state: { integratedRevision: 'integrated-revision',
      projectResult: 'confirmed' }, evidenceRefs: ['evidence:project-effect'] }
  ][sequence - 1];
}

async function checkpoint(ctx, input) {
  return runtime.checkpointDelegation(ctx.db, { missionId: input.missionId,
    owner: input.owner, fence: input.fence, nowMs: input.nowMs,
    sequence: input.sequence, ...stepData(input.sequence) });
}

async function closeAndLearn(ctx, input) {
  const accepted = await decisions.closeDelegation(ctx.db, { missionId: input.missionId,
    owner: input.owner, fence: input.fence, nowMs: input.nowMs, outcome: 'ACCEPT' });
  const candidate = await feedback.recordCandidate(ctx.db, { ...ctx.scope, payload: {
    responsibilityId: ctx.responsibilityId, feedbackId: `feedback-${input.missionId}`,
    proposerId: 'learning-proposer', claim: 'La correction produit un apprentissage borne.',
    sourceRefs: ['evidence:project-effect'], proposedAt: '2026-10-20T09:00:00.000Z' } });
  const learned = await feedback.decide(ctx.db, { ...ctx.scope, payload: {
    feedbackId: candidate.candidate.feedbackId, decisionId: `learning-${input.missionId}`,
    verification: { verifierId: 'learning-verifier', verdict: 'SUPPORTED',
      evidenceRefs: ['evidence:learning'] },
    authority: { authorityId: 'learning-authority', authorityRef: 'authority:learning',
      disposition: 'AUTHORIZED', responsibilityVersion: 1 },
    decidedAt: '2026-10-20T09:05:00.000Z' } });
  const responsibility = await ledger.current(ctx.db, { ...ctx.scope,
    responsibilityId: ctx.responsibilityId });
  const learning = arbitration.arbitrate({ responsibility, responsibilityVersion: 1,
    trajectory: trajectory(), feedback: candidate.candidate, learningDecision: learned.decision });
  return { accepted, learning, promotionAuthorized: false };
}

async function reopen(ctx) {
  await ctx.db.close();
  ctx.db = await memoryDb(ctx.filename);
  return ctx;
}

async function destroy(ctx) {
  await ctx.db.close().catch(() => {});
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

module.exports = { createFixture, startQualification, checkpoint, closeAndLearn,
  reopen, destroy, stepData, runtime, ledger, observations };

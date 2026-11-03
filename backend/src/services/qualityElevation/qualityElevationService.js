'use strict';
const crypto = require('node:crypto');
const { POLICIES, compileQualityContract, verifyContract, digest, freeze, fail } = require('./qualityContract');
const { evaluateArtifact } = require('./qualityEvaluatorRegistry');
const { assessArtifact, calibrateReviewer, reviewerMetadata, dependencyGroupCount, isIssuedAssessment } = require('./qualityReviewService');
const { compareVersions, mirroredComparison } = require('./qualityComparisonService');
const { createInvoker } = require('./qualityBudget');
const { buildRepairPlan, buildRepairPrompt } = require('./qualityRepairPlanner');
const { constructScreenplay } = require('./qualityNarrativeWorkflow');
function createElevationSession(contract) {
  verifyContract(contract);
  return { schema: 'genos.gqel-session/v2', sessionId: crypto.randomUUID(), contract, versions: [], comparisons: [],
    bestVersionIndex: -1, strategyMutations: 0, rounds: 0, calls: [], plans: [], sceneDrafts: [], controls: [], events: [],
    drafts: [], protocolAttempts: [], planRepairs: [],
    status: 'in_progress', budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
}
function recordIterationVersion(session, content, evaluation) {
  if (!isIssuedAssessment(evaluation) || evaluation.phase !== 'artifact') throw fail('GQEL_UNTRUSTED_EVALUATION', 'A runtime artifact assessment is required.');
  if (evaluation.artifactDigest !== digest(content) || evaluation.contractDigest !== session.contract.digest) throw fail('GQEL_STALE_EVALUATION', 'Assessment does not bind this artifact and contract.');
  const record = freeze({ version: session.versions.length + 1, content, digest: digest(content), evaluation,
    score: evaluation.score, passed: evaluation.passed, defects: evaluation.defects, metrics: evaluation.metrics });
  session.versions.push(record);
  if (session.bestVersionIndex < 0) session.bestVersionIndex = 0;
  return record;
}
function isRepeated(session) {
  if (session.versions.length < 2) return false;
  const pair = session.versions.slice(-2);
  const signature = version => digest(version.defects.map(item => `${item.code}:${item.section}`).sort());
  return pair[0].digest === pair[1].digest || (pair[1].defects.length > 0 && signature(pair[0]) === signature(pair[1]));
}
function decideContinuation(session) {
  const best = session.versions[session.bestVersionIndex];
  if (best?.passed && session.budget.usageComplete) {
    session.status = 'promoted'; return { action: 'stop', reason: 'BOUNDED_CONTRACT_SATISFIED', status: session.status };
  }
  if (session.rounds >= session.contract.maxIterations) {
    session.status = 'needs_review'; return { action: 'stop', reason: 'MAX_ITERATIONS_REACHED', status: session.status };
  }
  if (isRepeated(session)) {
    if (session.strategyMutations >= session.contract.maxStrategyMutations) {
      session.status = 'stagnated'; return { action: 'stop', reason: 'NO_VERIFIED_PROGRESS', status: session.status };
    }
    session.strategyMutations++; return { action: 'mutate_strategy', reason: 'REPLAN_REQUIRED', status: session.status };
  }
  return { action: 'continue_repair', reason: 'UNRESOLVED_OBLIGATIONS', status: session.status };
}
function normalizeInput(driver, options) {
  return typeof driver?.generate === 'function' ? { ...options, generator: driver.generate.bind(driver), reviewers: options.reviewers || driver.reviewers }
    : { ...options, ...driver };
}
function selectReviewers(input, contract) {
  const reviewers = (input.reviewers || []).slice(0, contract.critiques);
  reviewers.forEach(reviewerMetadata);
  if (reviewers.length < contract.critiques) throw fail('GQEL_REVIEWERS_MISSING', 'Not enough configured reviewers.');
  if (new Set(reviewers.map(item => item.id)).size !== reviewers.length) throw fail('GQEL_REVIEWER_DUPLICATED', 'Duplicate reviewer identity.');
  if (dependencyGroupCount(reviewers.map(reviewerMetadata)) < contract.minDependencyGroups) throw fail('GQEL_DEPENDENCE_LIMIT', 'Independent dependency groups missing.');
  return reviewers;
}
async function initializeReviews(context) {
  if (!context.contract.requireCalibration) return;
  for (const reviewer of context.reviewers) {
    const control = await calibrateReviewer(reviewer, context);
    context.session.controls.push(control);
    if (!control.passed) throw fail('GQEL_REVIEWER_CONTROL_FAILED', 'Reviewer failed positive/negative controls; no promotion.');
  }
}
async function verifyCode(context, content, scan) {
  if (context.contract.profile !== 'code') return scan;
  if (typeof context.input.verifier !== 'function') {
    scan.defects.push({ code: 'EXECUTION_PROOF_MISSING', severity: 'blocker', stage: 'draft', section: 'tests',
      message: 'Un vérificateur runtime exécutant des tests protégés est requis.', evidence: [] }); return scan;
  }
  const result = await context.invoke(context.input.verifier, { operation: 'external_verification',
    prompt: content, content, artifactDigest: digest(content), contractDigest: context.contract.digest });
  const backed = result?.artifactDigest === digest(content) && result.executed === true && Array.isArray(result.evidenceRefs) && result.evidenceRefs.length > 0;
  if (!backed || result.passed !== true) scan.defects.push({ code: 'EXECUTION_NOT_VERIFIED', severity: 'blocker',
    stage: 'draft', section: 'tests', message: 'Les tests exécutés ne valident pas cet artefact.', evidence: [] });
  scan.externalVerification = result; return scan;
}
async function produce(context) {
  if (context.iteration === 1 && typeof context.input.initialContent === 'string' && context.input.initialContent.trim()) {
    return { content: context.input.initialContent, construction: null };
  }
  if (context.contract.profile === 'screenplay' && context.input.planScenes !== false) return constructScreenplay(context);
  const prior = context.session.versions[context.session.bestVersionIndex];
  const prompt = prior || context.repairPlan.obligations.length
    ? buildRepairPrompt(context.contract.mission, prior, { repairPlan: context.repairPlan }) : context.contract.mission;
  const content = await context.invoke(context.generator, { operation: 'generate', stage: 'draft', iteration: context.iteration, prompt, repairPrompt: prompt });
  if (typeof content !== 'string') throw fail('GQEL_ARTIFACT_INVALID', 'Generator must return deliverable text.');
  return { content, construction: null };
}
async function considerCandidate(context, current) {
  const session = context.session, incumbent = session.versions[session.bestVersionIndex];
  if (incumbent === current) return;
  const comparison = compareVersions(incumbent, current);
  if (comparison.isBetter && context.contract.requireDoubleBlind) comparison.preference = await mirroredComparison({
    a: incumbent, b: current, contract: context.contract, invoke: context.invoke, reviewer: context.reviewers[0], session });
  const preferencePass = !context.contract.requireDoubleBlind || comparison.preference?.improvementSupported === true;
  comparison.selected = comparison.isBetter && preferencePass; session.comparisons.push(comparison);
  if (comparison.selected) session.bestVersionIndex = session.versions.length - 1;
}
async function checkpoint(context, event) {
  context.session.events.push({ ...event, at: new Date().toISOString() });
  if (context.input.onCheckpoint) await context.input.onCheckpoint(structuredClone(context.session));
}
async function retainDraft(context, candidate) {
  const record = freeze({ draft: context.session.drafts.length + 1, iteration: context.iteration,
    content: candidate.content, digest: digest(candidate.content), acceptedForDelivery: false,
    provisionalPlan: candidate.construction?.planState?.provisional === true });
  context.session.drafts.push(record);
  await checkpoint(context, { type: 'DRAFT_PRODUCED', draft: record.draft, digest: record.digest, acceptedForDelivery: false });
}
async function runRound(context) {
  const candidate = await produce(context);
  await retainDraft(context, candidate);
  const scan = evaluateArtifact(context.contract.domain, candidate.content, { mission: context.contract.mission, contract: context.contract });
  await verifyCode(context, candidate.content, scan);
  const evaluation = await assessArtifact({ ...context, content: candidate.content, scan });
  const current = recordIterationVersion(context.session, candidate.content, evaluation);
  await considerCandidate(context, current);
  if (context.session.versions[context.session.bestVersionIndex] === current) context.construction = candidate.construction;
  await checkpoint(context, { type: 'VERSION_REVIEWED', version: current.version, digest: current.digest });
  return current;
}
function counters(session) {
  return { artifactRounds: session.rounds, planRepairs: session.planRepairs.length,
    protocolRepairs: session.protocolAttempts.filter(item => item.attempt > 0).length,
    plansProduced: session.plans.length, scenesWritten: session.sceneDrafts.length,
    draftsProduced: session.drafts.length, versionsReviewed: session.versions.length };
}
function partialResult(session) {
  const best = session.versions[session.bestVersionIndex] || null, initial = session.versions[0];
  const selectedComparison = session.comparisons.findLast(item => item.selected);
  return { schema: 'genos.gqel-result/v2', promoted: session.status === 'promoted', finalStatus: session.status,
    contract: session.contract, session, bestVersion: best, lastCandidate: session.drafts.at(-1) || null, progress: counters(session),
    totalIterations: session.rounds, comparisons: session.comparisons, demonstratedGain: null,
    observedRubricDelta: Number.isFinite(best?.score) && Number.isFinite(initial?.score) ? best.score - initial.score : null,
    isImproved: selectedComparison?.preference?.improvementSupported === true,
    improvementEvidence: { withinRunPreference: selectedComparison?.preference || null, causalUpliftVsModelAlone: false, humanValidated: false },
    terminalError: session.terminalError || null };
}
async function runRounds(context) {
  while (context.session.rounds < context.contract.maxIterations) {
    context.iteration = ++context.session.rounds;
    try { await runRound(context); }
    catch (error) {
      if (!error.repairable) throw error;
      context.rejectedPlan = error.plan || context.rejectedPlan;
      context.repairPlan = buildRepairPlan({ defects: error.defects, content: '' });
      await checkpoint(context, { type: 'CONSTRUCTION_REJECTED', code: error.code, defects: error.defects }); continue;
    }
    const decision = decideContinuation(context.session);
    await checkpoint(context, { type: 'DECISION', ...decision });
    if (decision.action === 'stop') return;
    context.repairPlan = buildRepairPlan(context.session.versions[context.session.bestVersionIndex], { mutate: decision.action === 'mutate_strategy' });
  }
  context.session.status = 'needs_review';
}
function assertFreshSession(session, contract) {
  if (!contract.mission.trim()) throw fail('GQEL_MISSION_REQUIRED', 'A non-empty brief is required.');
  if (session.versions.length || session.rounds) throw fail('GQEL_RESUME_REVERIFY_REQUIRED', 'Reloaded sessions require fresh verification; replay is not authorization.');
  if (session.contract.digest !== contract.digest) throw fail('GQEL_CONTRACT_CHANGED', 'Session contract differs.');
}
async function executeElevationLoop(driverOrInput, options = {}) {
  const input = normalizeInput(driverOrInput, options), contract = input.contract || compileQualityContract(input);
  verifyContract(contract);
  const session = input.session || createElevationSession(contract);
  assertFreshSession(session, contract);
  const context = { input, contract, session, generator: input.generator, construction: null, repairPlan: buildRepairPlan(null), invoke: createInvoker(contract, session) };
  try {
    const repair = require('./qualityRepairObligations').repairPlan(input.repairObligations, contract);
    if (repair) {
      context.repairPlan = repair;
      await checkpoint(context, { type: 'REPAIR_OBLIGATIONS_ACCEPTED', repairPlan: repair });
    }
    context.reviewers = selectReviewers(input, contract); await initializeReviews(context); await runRounds(context);
  }
  catch (error) {
    session.status = 'needs_review'; session.terminalError = { code: error.code || 'GQEL_EXECUTION_FAILED', message: error.message };
    session.events.push({ type: 'STOPPED_WITHOUT_PROMOTION', ...session.terminalError });
  }
  const result = partialResult(session);
  if (input.worker && result.promoted) require('./workerQualityContractEnforcer').bindQualityResult(input.worker, result);
  return result;
}
module.exports = { compileQualityContract, createElevationSession, recordIterationVersion,
  decideContinuation, buildRepairPrompt, executeElevationLoop, POLICIES };

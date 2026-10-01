'use strict';

const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { defaultForaging } = require('./foragingScoutHarvesterService');
const { defaultBrowserScout } = require('./browserScoutService');
const { defaultFovealVision } = require('./fovealVisionService');
const { withDeadline } = require('./operationDeadline');
const { runImageTask } = require('./foragingImageTask');

function patchDecision(history, elapsed) {
  const patchHistory = Array.isArray(history) ? history : [];
  return defaultForaging.evaluatePatchYield(patchHistory, Number(elapsed || 2));
}

function levyGuidance(iteration) {
  return defaultForaging.computeLevyFlightStep(Number(iteration || 1));
}

function selectNextUrl(session, source) {
  const explicit = source.nextUrl || source.next_url;
  if (explicit) return explicit;
  if (!session || !session.currentUrl) return null;
  const link = session.axTree.find(node => node.role === 'link' && !node.isDownload);
  return link ? new URL(link.href, session.currentUrl).href : null;
}

function skippedAction(observation) {
  const hasObservation = Boolean(observation);
  return {
    status: hasObservation ? 'observation_only' : 'not_executed',
    executed: false,
    verified: false,
    ...(hasObservation ? {} : { reason: 'Browser session has no observation.' })
  };
}

async function departPatch(input) {
  const session = defaultBrowserScout.getSession(input.sessionId);
  const nextUrl = selectNextUrl(session, input.source);
  if (!nextUrl) {
    return { action: { status: 'not_executed', executed: false, verified: false, reason: 'No next URL supplied.' }, observation: input.observation };
  }
  const navigation = await defaultBrowserScout.navigate(input.sessionId, nextUrl, {
    htmlContent: input.source.htmlContent, signal: input.source.signal
  });
  const executed = Boolean(navigation && navigation.success);
  return {
    action: { status: executed ? 'executed' : 'failed', executed, verified: executed, navigation },
    observation: defaultBrowserScout.snapshotSession(input.sessionId)
  };
}

async function performForagingAction(input) {
  if (!input.evaluation.shouldDepart) {
    return { action: skippedAction(input.observation), observation: input.observation };
  }
  return departPatch(input);
}

function createForagingReceipt(input) {
  const receipt = {
    sessionId: input.sessionId,
    decision: input.decision,
    actionStatus: input.action.status,
    actionExecuted: Boolean(input.action.executed),
    actionVerified: Boolean(input.action.verified),
    measuredMs: input.measuredMs,
    observedUrl: input.observation && input.observation.currentUrl,
    observationGain: input.observation && input.observation.infoGain,
    screenshotPath: input.observation && input.observation.screenshotPath,
    fovealImageHash: input.fovealArtifact && input.fovealArtifact.sha256,
    navigationSuccess: Boolean(input.action.navigation && input.action.navigation.success)
  };
  const evidenceRef = `sha256:${crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  return { ...receipt, evidenceRef };
}

function observationHistory(session, source) {
  if (session && session.browserPage) return [...(session.patchInfoHistory || [])];
  return [...(source.patchHistory || source.history || [])];
}

async function createFovealArtifact(input) {
  const { session, observation, shouldDepart, signal } = input;
  if (!session || !session.browserPage || !observation || !observation.screenshotPath || shouldDepart) return null;
  return runImageTask({ signal, data: { screenshotPath: observation.screenshotPath } });
}

function createForageResponse(input) {
  const receipt = createForagingReceipt(input);
  return {
    decision: input.decision,
    navigated: Boolean(input.action.navigation && input.action.navigation.success),
    evaluation: input.evaluation,
    levy: input.levy,
    observation: input.observation,
    observationBefore: input.before,
    observationAfter: input.observation,
    action: input.action,
    fovealArtifact: input.fovealArtifact,
    navigation: input.action.navigation || null,
    measurement: { decisionActionMs: input.measuredMs },
    receipt,
    ...(input.evaluation.shouldDepart ? {} : { suggestedFovea: { action: 'scan' } })
  };
}

async function executeForageStep(input) {
  const startedAt = performance.now();
  const source = input || {};
  const sessionId = source.sessionId || source.session_id || 'scout-main';
  const session = defaultBrowserScout.getSession(sessionId);
  const evaluation = patchDecision(observationHistory(session, source), source.elapsedTimeSec);
  const decision = evaluation.shouldDepart ? 'PATCH_DEPARTURE' : 'EXPLOIT_PATCH';
  const levy = levyGuidance(source.iteration);
  const before = defaultBrowserScout.snapshotSession(sessionId);
  const result = await performForagingAction({ evaluation, source, sessionId, observation: before });
  const fovealArtifact = await createFovealArtifact({ session, observation: result.observation, shouldDepart: evaluation.shouldDepart, signal: source.signal });
  const measuredMs = Number((performance.now() - startedAt).toFixed(3));
  return createForageResponse({
    sessionId, decision, evaluation, levy, before,
    action: result.action, observation: result.observation,
    fovealArtifact, measuredMs
  });
}

function forageStep(input = {}) {
  return withDeadline(input, signal => executeForageStep({ ...input, signal }));
}

module.exports = { patchDecision, levyGuidance, forageStep };

'use strict';

const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { defaultForaging } = require('./foragingScoutHarvesterService');
const { defaultBrowserScout } = require('./browserScoutService');
const { defaultFovealVision } = require('./fovealVisionService');
const { withDeadline } = require('./operationDeadline');
const { runImageTask } = require('./foragingImageTask');
const sensorium = require('./perception/sensoriumService');
const { makeObservation } = require('./perception/observationService');
const { EvidenceState, createEnvelope } = require('./evidenceContractService');

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

function normalizeNavigationScope(scope) {
  if (scope === undefined || scope === null) return null;
  const values = Array.isArray(scope) ? scope : [scope];
  if (!values.length) return [];
  return values.map(value => {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Foraging navigation scope requires credential-free HTTP(S) origins.');
    }
    return parsed.origin;
  });
}

function pageScope(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { origin: parsed.origin, pathname: parsed.pathname };
  } catch (_) {
    return null;
  }
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
  const scope = normalizeNavigationScope(input.source.navigationScope);
  if (scope && !scope.includes(new URL(nextUrl).origin)) {
    return { action: { status: 'refused', executed: false, verified: false,
      reason: 'Navigation target is outside the configured foraging origin scope.', targetUrl: nextUrl },
    observation: input.observation };
  }
  const navigation = await defaultBrowserScout.navigate(input.sessionId, nextUrl, {
    htmlContent: input.source.htmlContent, signal: input.source.signal, navigationScope: scope
  });
  const executed = Boolean(navigation && navigation.success);
  return {
    action: { status: navigation && navigation.refused ? 'refused' : executed ? 'executed' : 'failed',
      executed: executed && !navigation.refused, verified: executed && !navigation.refused, navigation },
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
  const navigationScope = normalizeNavigationScope(input.navigationScope);
  const receipt = {
    sessionId: input.sessionId,
    decision: input.decision,
    actionStatus: input.action.status,
    actionExecuted: Boolean(input.action.executed),
    actionVerified: Boolean(input.action.verified),
    measuredMs: input.measuredMs,
    observedUrl: input.observation && input.observation.currentUrl,
    observedPageScope: pageScope(input.observation && input.observation.currentUrl),
    observedTextDigest: observedTextDigest(input.observation),
    navigationScope,
    observationGain: input.observation && input.observation.infoGain,
    screenshotPath: input.observation && input.observation.screenshotPath,
    fovealImageHash: input.fovealArtifact && input.fovealArtifact.sha256,
    navigationSuccess: Boolean(input.action.navigation && input.action.navigation.success),
    sensoriumObservationDigest: input.sensoriumObservation && input.sensoriumObservation.provenance
      ? input.sensoriumObservation.provenance.observationDigest : null
  };
  const evidenceRef = `sha256:${crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  return { ...receipt, evidenceRef };
}

function observedTextDigest(observation) {
  const text = observation && observation.observationText;
  if (typeof text !== 'string') return null;
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
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
  const evidenceEnvelope = createForagingEvidence(input, receipt);
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
    sensoriumObservation: input.sensoriumObservation || null,
    navigation: input.action.navigation || null,
    measurement: { decisionActionMs: input.measuredMs },
    receipt: { ...receipt, evidenceEnvelope, evidenceState: evidenceEnvelope.state },
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
  const sensoriumObservation = recordForagingObservation({ agentId: source.agentId, observation: result.observation,
    receipt: { sessionId, decision, action: result.action, fovealArtifact } });
  const measuredMs = Number((performance.now() - startedAt).toFixed(3));
  return createForageResponse({
    sessionId, decision, evaluation, levy, before,
    action: result.action, observation: result.observation,
    fovealArtifact, sensoriumObservation, measuredMs, navigationScope: source.navigationScope,
    agentId: source.agentId
  });
}

function forageStep(input = {}) {
  return withDeadline(input, signal => executeForageStep({ ...input, signal }));
}

module.exports = { patchDecision, levyGuidance, forageStep };

function recordForagingObservation(input) {
  if (!input.agentId || !input.observation) return null;
  if (!sensorium.getSensorium(input.agentId)) sensorium.createSensorium({ agentId: input.agentId });
  const observation = makeObservation({
    sensorId: 'web', agentId: input.agentId, target: input.observation.currentUrl,
    uncertaintyBefore: 1, uncertaintyAfter: Math.max(0, 1 - Number(input.observation.infoGain || 0)),
    evidenceState: EvidenceState.OBSERVED,
    data: { observationText: input.observation.observationText, decision: input.receipt.decision,
      actionStatus: input.receipt.action.status, fovealImageHash: input.receipt.fovealArtifact?.sha256,
      evidenceState: EvidenceState.OBSERVED }
  });
  sensorium.recordObservation({ agentId: input.agentId, observation });
  return observation;
}

function createForagingEvidence(input, receipt) {
  const hasObservation = Boolean(input.observation);
  const replayInput = {
    sessionId: input.sessionId,
    decision: input.decision,
    observedUrl: receipt.observedUrl,
    observedTextDigest: receipt.observedTextDigest,
    fovealImageHash: receipt.fovealImageHash
  };
  return createEnvelope({
    sourceId: 'web-foraging',
    captureId: input.sessionId || 'foraging-session',
    input: { decision: input.decision, evaluation: input.evaluation, navigationScope: input.navigationScope || null },
    output: { receipt, observation: input.observation, action: input.action, fovealArtifact: input.fovealArtifact || null },
    state: hasObservation ? EvidenceState.OBSERVED : EvidenceState.REJECTED,
    rejectionReason: hasObservation ? null : 'foraging produced no observation',
    replayKey: `sha256:${crypto.createHash('sha256').update(JSON.stringify(replayInput), 'utf8').digest('hex')}`
  });
}

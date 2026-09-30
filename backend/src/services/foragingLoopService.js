'use strict';

const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { defaultForaging } = require('./foragingScoutHarvesterService');
const { defaultBrowserScout } = require('./browserScoutService');

function patchDecision(history, elapsed) {
  const patchHistory = Array.isArray(history) ? history : [];
  return defaultForaging.evaluatePatchYield(patchHistory, Number(elapsed || 2));
}

function levyGuidance(iteration) {
  return defaultForaging.computeLevyFlightStep(Number(iteration || 1));
}

async function performForagingAction({ evaluation, source, sessionId, observation }) {
  if (evaluation.shouldDepart) {
    const nextUrl = source.nextUrl || source.next_url || null;
    if (!nextUrl) {
      return { action: { status: 'not_executed', executed: false, reason: 'No next URL supplied.' }, observation };
    }
    const navigation = await defaultBrowserScout.navigate(sessionId, nextUrl, { htmlContent: source.htmlContent });
    return {
      action: {
        status: navigation && navigation.success ? 'executed' : 'failed',
        executed: Boolean(navigation && navigation.success),
        navigation
      },
      observation: defaultBrowserScout.snapshotSession(sessionId)
    };
  }
  const action = observation
    ? { status: 'observation_only', executed: false }
    : { status: 'not_executed', executed: false, reason: 'Browser session has no observation.' };
  return { action, observation };
}

function createForagingReceipt({ sessionId, decision, action, observation, measuredMs }) {
  const receipt = {
    sessionId,
    decision,
    actionStatus: action.status,
    measuredMs,
    observedUrl: observation && observation.currentUrl,
    navigationSuccess: Boolean(action.navigation && action.navigation.success)
  };
  const evidenceRef = `sha256:${crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  return { ...receipt, evidenceRef };
}

async function forageStep(input) {
  const startedAt = performance.now();
  const source = input || {};
  const sessionId = source.sessionId || source.session_id || 'scout-main';
  const evaluation = patchDecision(source.patchHistory || source.history, source.elapsedTimeSec);
  const decision = evaluation.shouldDepart ? 'PATCH_DEPARTURE' : 'EXPLOIT_PATCH';
  const levy = levyGuidance(source.iteration);
  const before = defaultBrowserScout.snapshotSession(sessionId);
  const { action, observation } = await performForagingAction({
    evaluation, source, sessionId, observation: before
  });
  const measuredMs = Number((performance.now() - startedAt).toFixed(3));
  const receipt = createForagingReceipt({ sessionId, decision, action, observation, measuredMs });
  return {
    decision,
    navigated: Boolean(action.navigation && action.navigation.success),
    evaluation,
    levy,
    observation,
    action,
    measurement: { decisionActionMs: measuredMs },
    receipt,
    ...(evaluation.shouldDepart ? {} : { suggestedFovea: { action: 'scan' } })
  };
}

module.exports = { patchDecision, levyGuidance, forageStep };

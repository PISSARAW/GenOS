'use strict';

const { defaultForaging } = require('./foragingScoutHarvesterService');
const { defaultBrowserScout } = require('./browserScoutService');

function patchDecision(history, elapsed) {
  const patchHistory = Array.isArray(history) ? history : [];
  return defaultForaging.evaluatePatchYield(patchHistory, Number(elapsed || 2));
}

function levyGuidance(iteration) {
  return defaultForaging.computeLevyFlightStep(Number(iteration || 1));
}

async function forageStep(input) {
  const source = input || {};
  const sessionId = source.sessionId || source.session_id || 'scout-main';
  const evaluation = patchDecision(source.patchHistory || source.history, source.elapsedTimeSec);
  const levy = levyGuidance(source.iteration);
  if (evaluation.shouldDepart) {
    const nextUrl = source.nextUrl || source.next_url || null;
    if (!nextUrl) {
      return { decision: 'PATCH_DEPARTURE', navigated: false, evaluation, levy, reason: 'No next URL supplied; departure decided but not executed.' };
    }
    const navigation = await defaultBrowserScout.navigate(sessionId, nextUrl, { htmlContent: source.htmlContent });
    return { decision: 'PATCH_DEPARTURE', navigated: Boolean(navigation && navigation.success), evaluation, levy, navigation };
  }
  const observation = defaultBrowserScout.snapshotSession(sessionId);
  return { decision: 'EXPLOIT_PATCH', evaluation, levy, observation, suggestedFovea: { action: 'scan' } };
}

module.exports = { patchDecision, levyGuidance, forageStep };

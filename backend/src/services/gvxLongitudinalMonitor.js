'use strict';

const { appendEvent } = require('./gvxDevelopmentLedger');
const { monitorSomaticApplication } = require('./gvxSomaticMonitor');

function validate(input) {
  if (!Array.isArray(input.windows) || input.windows.length < 2) throw new Error('independent-monitor-windows-required');
  const ids = new Set(input.windows.map((window) => window.observationId));
  const contexts = new Set(input.windows.map((window) => window.contextHash));
  if (ids.size !== input.windows.length || input.windows.some((window) => !window.observationId || !window.contextHash)) throw new Error('longitudinal-window-identity-invalid');
  if (contexts.size < 2) throw new Error('longitudinal-context-diversity-required');
}

function summarize(results, windows, minimumStableWindows) {
  const scores = results.map((item) => item.assessment.status === 'recommend_somatic_trial' ? 1
    : item.assessment.status === 'no_measured_gain' ? 0 : null).filter(Number.isFinite);
  const regressions = results.filter((item) => item.assessment.status === 'reject').length;
  const positive = results.filter((item) => item.assessment.status === 'recommend_somatic_trial').length;
  const mean = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const variance = scores.length ? scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length : null;
  const stable = regressions === 0 && positive >= minimumStableWindows;
  return { windows: windows.length, meanEffect: mean, effectVariance: variance,
    regressionRate: regressions / windows.length, environmentDiversity: new Set(windows.map((window) => window.contextHash)).size,
    stable, maturity: stable ? 'mature_somatic_eligible' : regressions ? 'rollback_recorded' : 'monitoring' };
}

async function monitor(db, input) {
  validate(input);
  const results = [];
  for (const window of input.windows) {
    results.push(await monitorSomaticApplication(db, { ...input, ...window }));
    if (results.at(-1).rollback) break;
  }
  const summary = summarize(results, input.windows.slice(0, results.length), input.minimumStableWindows || 3);
  const event = await appendEvent(db, { ...input.scope, entityId: input.entityId,
    type: 'evidence_attached', parentHash: input.parentHash, candidateHash: input.candidateHash,
    payload: { kind: 'gvx_longitudinal_monitor', applicationId: input.applicationId, summary,
      observationIds: input.windows.slice(0, results.length).map((window) => window.observationId) } });
  return { ...summary, eventId: event.id, results };
}

module.exports = { monitor, validate, summarize };

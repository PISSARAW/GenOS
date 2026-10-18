'use strict';

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function receiptReady(receipt) {
  return receipt?.verified === true && receipt?.realExecution === true
    && Boolean(receipt?.evidenceRef) && finite(Date.parse(receipt?.observedAt));
}

function metricReady(metrics) {
  return finite(metrics?.successRate) && Number(metrics.successRate) >= 0
    && Number(metrics.successRate) <= 1 && finite(metrics?.errorRate)
    && finite(metrics?.p95LatencyMs) && finite(metrics?.costPerTask)
    && finite(metrics?.driftScore);
}

function limitsReady(metrics, limits) {
  return Number(metrics.errorRate) <= Number(limits.maxErrorRate)
    && Number(metrics.p95LatencyMs) <= Number(limits.maxP95LatencyMs)
    && Number(metrics.costPerTask) <= Number(limits.maxCostPerTask)
    && Number(metrics.driftScore) <= Number(limits.maxDriftScore);
}

function canaryIdentityReady(canary) {
  return canary?.outcome === 'passed' && canary?.rollbackReady === true
    && Boolean(canary?.environmentId) && Boolean(canary?.windowId)
    && receiptReady(canary.receipt);
}

function canaryReady(canary, limits) {
  const metrics = canary?.metrics || {};
  return canaryIdentityReady(canary) && metricReady(metrics) && limitsReady(metrics, limits);
}

function baseBlockers(input) {
  const blockers = [];
  if (input.phase !== 'post-release') blockers.push('post_release_phase_required');
  if (input.sourceClean !== true) blockers.push('source_tree_dirty');
  if (input.p7?.status !== 'reviewable') blockers.push('phase7_not_reviewable');
  if (input.p7?.universalGeneralization !== false) blockers.push('phase7_scope_not_bounded');
  if (!input.releaseCommit) blockers.push('release_commit_missing');
  return blockers;
}

function monitoringBlockers(input) {
  const monitor = input.monitoring || {};
  const incidents = Array.isArray(input.incidents) ? input.incidents : [];
  const blockers = [];
  if (monitor.telemetryVerified !== true || monitor.alertRulesLoaded !== true
    || Number(monitor.sampleCount) < 1) blockers.push('monitoring_evidence_missing');
  if (incidents.some(incident => incident.open === true)) blockers.push('open_operational_incident');
  return blockers;
}

function canaryBlockers(input, canaries) {
  const limits = input.limits || {};
  const windows = unique(canaries.map(canary => canary.windowId));
  const environments = unique(canaries.map(canary => canary.environmentId));
  const blockers = [];
  if (canaries.length < Number(input.requiredCanaryRuns || 3)) blockers.push('canary_coverage_incomplete');
  if (windows.length < Number(input.requiredWindows || 3)) blockers.push('observation_windows_incomplete');
  if (environments.length < Number(input.requiredEnvironments || 2)) blockers.push('environment_coverage_incomplete');
  if (canaries.some(canary => !canaryReady(canary, limits))) blockers.push('canary_slo_or_receipt_failed');
  return blockers;
}

function qualifyPhase8Operations(input = {}) {
  const canaries = Array.isArray(input.canaryRuns) ? input.canaryRuns : [];
  const blockers = [...baseBlockers(input), ...monitoringBlockers(input), ...canaryBlockers(input, canaries)];
  const metrics = canaries.map(canary => canary.metrics || {});
  return {
    schema: 'genos.morphogenesis.phase8-operational-gate/v1',
    status: blockers.length ? 'blocked' : 'observed',
    scope: { releaseCommit: input.releaseCommit || null,
      environments: unique(canaries.map(canary => canary.environmentId)),
      windows: unique(canaries.map(canary => canary.windowId)) },
    canaryRunCount: canaries.length,
    metrics: { maxErrorRate: metrics.length ? Math.max(...metrics.map(metric => Number(metric.errorRate))) : null,
      maxP95LatencyMs: metrics.length ? Math.max(...metrics.map(metric => Number(metric.p95LatencyMs))) : null,
      maxCostPerTask: metrics.length ? Math.max(...metrics.map(metric => Number(metric.costPerTask))) : null,
      maxDriftScore: metrics.length ? Math.max(...metrics.map(metric => Number(metric.driftScore))) : null },
    blockers,
    continuedOperationEligible: blockers.length === 0,
    continuousPromotionAuthorized: false,
    runtimePromotionAuthorized: false,
    universalGeneralization: false,
    caveat: 'Cette observation post-release reste bornée aux fenêtres, environnements et seuils fournis; elle ne prouve ni stabilité indéfinie ni généralisation universelle.'
  };
}

module.exports = { qualifyPhase8Operations, canaryReady };

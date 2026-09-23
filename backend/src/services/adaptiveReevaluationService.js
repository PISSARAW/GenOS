'use strict';

/**
 * @file adaptiveReevaluationService.js
 * @description Analyzes post-evidence signals to compute a regret score and
 * trigger strategy, topology, capability, or worker re-evaluation when the
 * current approach underperforms relative to the Capability Graph.
 */

const { resolveCapabilities } = require('./capabilityResolverService');
const { emit } = require('./agentOrchestrationState');
const {
  contractFor, missingCapabilities, capabilitiesForMode,
} = require('./topologyCapabilityService');

const PROVENANCE_SOURCE = 'adaptiveReevaluationService';

let reevaluationRateLimitMs = Number(process.env.GENOS_REEVAL_RATE_LIMIT_MS) || 30000;
let regretThreshold = Number(process.env.GENOS_REGRET_THRESHOLD) || 0.35;
let workerStallMs = Number(process.env.GENOS_WORKER_STALL_MS) || 60000;

let currentConfig = {
  rateLimitMs: reevaluationRateLimitMs,
  regretThreshold,
  workerStallMs,
};

const lastReevaluation = new Map();
const reevaluationLog = [];
const MAX_LOG_SIZE = 1000;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function isAuthorized(entry) {
  return entry.category === 'strategy' && entry.authorized;
}

function buildResolveCtx(ctx) {
  return {
    ...ctx,
    mode: ctx.mode || (ctx.currentTopology && ctx.currentTopology.mode),
    topology: (ctx.currentTopology && ctx.currentTopology.organization) || ctx.topology,
    budget: ctx.budget || {},
  };
}

function computeEvidenceRegret(evidence) {
  if (!evidence || !evidence.length) return 0;
  const failed = evidence.filter((e) => {
    const s = (e.status || e.outcome || '').toLowerCase();
    return s === 'failed' || s === 'rejected' || s === 'failure';
  }).length;
  return clamp01(failed / evidence.length);
}

function bestStrategyUtility(ctx) {
  const result = resolveCapabilities(ctx);
  const strategies = (result.ranked || []).filter(isAuthorized);
  if (!strategies.length) return 0;
  return strategies[0].utility || 0;
}

function currentUtility(currentStrategy, ctx) {
  const result = resolveCapabilities(ctx);
  const current = (result.ranked || []).find((s) => s.id === currentStrategy);
  if (!current) return 0;
  return current.utility || 0;
}

function computeStrategyRegret(currentStrategy, ctx) {
  if (!currentStrategy) return 0.5;
  return clamp01(bestStrategyUtility(ctx) - currentUtility(currentStrategy, ctx));
}

function computeTopologyRegret(currentTopology, expressedCapabilities, ctx) {
  const org = currentTopology || (ctx.currentTopology && ctx.currentTopology.organization);
  if (!org) return 0.3;
  const contract = contractFor({ mode: ctx.mode, organization: org });
  if (!contract.required || !contract.required.length) return 0;
  const missing = missingCapabilities(contract, expressedCapabilities);
  return clamp01(missing.length / contract.required.length);
}

function computeWorkerStallRegret(activeWorkers) {
  if (!activeWorkers || !activeWorkers.length) return 0;
  const t = Date.now();
  const stalled = activeWorkers.filter((w) => {
    const last = w.lastUpdate || w.lastHeartbeat || w.updatedAt || 0;
    return t - last > workerStallMs;
  }).length;
  return clamp01(stalled / activeWorkers.length);
}

function computeRegretScore(ctx) {
  const resolveCtx = buildResolveCtx(ctx);
  const e = computeEvidenceRegret(ctx.evidence || []);
  const s = computeStrategyRegret(ctx.currentStrategy, resolveCtx);
  const top = computeTopologyRegret(null, ctx.expressedCapabilities, resolveCtx);
  const w = computeWorkerStallRegret(ctx.activeWorkers);
  return {
    score: Number(clamp01(e * 0.35 + s * 0.30 + top * 0.20 + w * 0.15).toFixed(3)),
    components: {
      evidence: Number(e.toFixed(3)),
      strategy: Number(s.toFixed(3)),
      topology: Number(top.toFixed(3)),
      worker: Number(w.toFixed(3)),
    },
  };
}

function findBetterStrategy(currentStrategy, ctx) {
  const result = resolveCapabilities(ctx);
  const strategies = (result.ranked || []).filter(isAuthorized);
  if (!strategies.length) return null;
  const current = strategies.find((s) => s.id === currentStrategy);
  if (!current) return strategies[0];
  const threshold = (current.utility || 0) + 0.05;
  let better = null;
  for (const s of strategies) {
    if ((s.utility || 0) > threshold) {
      better = s;
      break;
    }
  }
  return better;
}

function getOrg(currentTopology, ctx) {
  if (currentTopology) return currentTopology;
  return ctx.currentTopology && ctx.currentTopology.organization;
}

function findBetterTopology(currentTopology, expressedCapabilities, ctx) {
  const org = getOrg(currentTopology, ctx);
  const contract = contractFor({ mode: ctx.mode, organization: org });
  const required = contract.required || [];
  if (!required.length) return null;
  const missing = missingCapabilities(contract, expressedCapabilities);
  if (!missing.length) return null;
  const modes = [
    'trinity', 'a_team', 'biome', 'biocenose',
    'holobionte', 'syncytium', 'rhizome', 'metapopulation',
  ];
  let best = null;
  for (const mode of modes) {
    const caps = capabilitiesForMode(mode);
    if (!caps) continue;
    const covered = missing.filter((m) => caps.required.includes(m));
    const score = covered.length;
    const better = !best || score > best.coverage;
    if (score > 0 && better) best = { mode, coverage: score, missingCovered: covered };
  }
  return best;
}

function detectMissingCapabilities(expressedCapabilities, ctx) {
  const org = ctx.currentTopology && ctx.currentTopology.organization;
  const contract = contractFor({ mode: ctx.mode, organization: org });
  return missingCapabilities(contract, expressedCapabilities);
}

function detectStalledWorkers(activeWorkers) {
  if (!activeWorkers || !activeWorkers.length) return [];
  const t = Date.now();
  return activeWorkers.filter((w) => {
    const last = w.lastUpdate || w.lastHeartbeat || w.updatedAt || 0;
    return t - last > workerStallMs;
  });
}

function logReevaluation(entry) {
  const record = {
    id: `reeval_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    provenance: PROVENANCE_SOURCE,
    threshold: regretThreshold,
    ...entry,
  };
  reevaluationLog.push(record);
  if (reevaluationLog.length > MAX_LOG_SIZE) reevaluationLog.shift();
  return record;
}

function checkRateLimit(agentId) {
  const last = lastReevaluation.get(agentId) || 0;
  return Date.now() - last >= reevaluationRateLimitMs;
}

function updateRateLimit(agentId) {
  lastReevaluation.set(agentId, Date.now());
}

function emitEvent(agentId, eventType, detail) {
  const severity = detail && detail.missingCount != null ? 'warning' : 'info';
  emit(agentId, eventType, 'ADAPTIVE_REEVALUATION', detail.message, { payload: detail, severity });
  return detail;
}

function triggerStrategyChange(opts) {
  const { agentId, ctx, regret, events } = opts;
  const better = findBetterStrategy(ctx.currentStrategy, ctx);
  if (!better) return;
  events.push({
    type: 'STRATEGY_CHANGE_REQUESTED',
    detail: emitEvent(agentId, 'STRATEGY_CHANGE_REQUESTED', {
      message: `Better strategy available: ${better.id} (utility ${better.utility})`,
      currentStrategy: ctx.currentStrategy,
      proposedStrategy: better.id,
      proposedUtility: better.utility,
      currentRegret: regret.score,
      strategyRegret: regret.components.strategy,
    }),
  });
}

function triggerTopologyChange(opts) {
  const { agentId, ctx, regret, events } = opts;
  const better = findBetterTopology(
    ctx.currentTopology && ctx.currentTopology.organization,
    ctx.expressedCapabilities,
    ctx,
  );
  if (!better) return;
  events.push({
    type: 'TOPOLOGY_CHANGE_REQUESTED',
    detail: emitEvent(agentId, 'TOPOLOGY_CHANGE_REQUESTED', {
      message: `Better topology: ${better.mode} covers ${better.coverage} missing capabilities`,
      currentTopology: ctx.currentTopology && ctx.currentTopology.organization,
      proposedMode: better.mode,
      coverage: better.coverage,
      missingCovered: better.missingCovered,
      topologyRegret: regret.components.topology,
    }),
  });
}

function triggerMissingCapabilities(opts) {
  const { agentId, ctx, regret, events } = opts;
  const missing = detectMissingCapabilities(ctx.expressedCapabilities, ctx);
  if (!missing.length) return;
  events.push({
    type: 'MISSING_CAPABILITY_REQUESTED',
    detail: emitEvent(agentId, 'MISSING_CAPABILITY_REQUESTED', {
      message: `Escalation: ${missing.length} missing capabilities — ${missing.join(', ')}`,
      missingCapabilities: missing,
      count: missing.length,
      missingCount: missing.length,
      topologyRegret: regret.components.topology,
    }),
  });
}

function triggerWorkerReallocation(opts) {
  const { agentId, ctx, regret, events } = opts;
  const stalled = detectStalledWorkers(ctx.activeWorkers);
  if (!stalled.length) return;
  events.push({
    type: 'REALLOCATE_WORKERS',
    detail: emitEvent(agentId, 'REALLOCATE_WORKERS', {
      message: `Reallocation needed: ${stalled.length} stalled workers`,
      stalledWorkerIds: stalled.map((w) => w.id),
      stalledCount: stalled.length,
      totalWorkers: ctx.activeWorkers ? ctx.activeWorkers.length : 0,
      workerRegret: regret.components.worker,
    }),
  });
}

function maybeReevaluate(ctx) {
  if (!ctx || !ctx.agentId) {
    return { reevaluated: false, reason: 'invalid_context', regret: null };
  }
  const { agentId } = ctx;
  if (!checkRateLimit(agentId)) {
    return { reevaluated: false, reason: 'rate_limited', regret: null };
  }
  const regret = computeRegretScore(ctx);
  if (regret.score < regretThreshold) {
    logReevaluation({ agentId, regret, action: 'no_action', reason: 'below_threshold', events: [] });
    return { reevaluated: false, reason: 'below_threshold', regret };
  }
  updateRateLimit(agentId);
  const events = [];
  const opts = { agentId, ctx: buildResolveCtx(ctx), regret, events };
  triggerStrategyChange(opts);
  triggerTopologyChange(opts);
  triggerMissingCapabilities(opts);
  triggerWorkerReallocation({ agentId, ctx, regret, events });
  const record = logReevaluation({
    agentId, regret, action: 'reevaluation_triggered',
    reason: 'regret_exceeds_threshold', events,
  });
  return { reevaluated: true, regret, events, recordId: record.id };
}

function getReevaluationLog(limit = 100) {
  return reevaluationLog.slice(-limit).reverse();
}

function configure(options = {}) {
  if (options.rateLimitMs != null) {
    reevaluationRateLimitMs = Number(options.rateLimitMs);
  }
  if (options.regretThreshold != null) {
    regretThreshold = Number(options.regretThreshold);
  }
  if (options.workerStallMs != null) {
    workerStallMs = Number(options.workerStallMs);
  }
  currentConfig = {
    rateLimitMs: reevaluationRateLimitMs,
    regretThreshold,
    workerStallMs,
  };
  return { ...currentConfig };
}

module.exports = {
  maybeReevaluate,
  computeRegretScore,
  findBetterStrategy,
  findBetterTopology,
  detectMissingCapabilities,
  detectStalledWorkers,
  getReevaluationLog,
  configure,
};

/**
 * Helpers partagés des primitives collectives (split pour le quality gate :
 * chaque fichier reste <= 400 lignes / complexité <= 10).
 */

function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function parseSqliteUtcTimestamp(ts) {
  if (!ts) return Date.now();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const str = String(ts).trim();
  if (!str) return Date.now();
  if (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str).getTime();
  }
  const isoUtc = str.replace(' ', 'T') + 'Z';
  const parsed = new Date(isoUtc).getTime();
  return Number.isNaN(parsed) ? new Date(str).getTime() : parsed;
}

function normalizePheromoneInput(context, orchestratorId) {
  const agentId = firstTruthy(context.agentId, context.agent_id, context.senderId, context.sender_agent_id, orchestratorId);
  const path = firstTruthy(context.path, context.trail, context.target_file, context.targetFile, 'default_trail');
  const rawStrength = context.strength === undefined ? 1 : Number(context.strength);
  const isRepellent = Boolean(firstTruthy(context.isRepellent, context.is_repellent, context.repellent, rawStrength < 0));
  return { agentId, path, rawStrength, isRepellent };
}

function validatePheromoneInput(orchestratorId, input) {
  if (!orchestratorId) return 'orchestratorId and agentId required for pheromone_deposit.';
  if (!input.agentId) return 'orchestratorId and agentId required for pheromone_deposit.';
  if (!Number.isFinite(input.rawStrength)) return 'pheromone strength must be a finite numerical value.';
  if (Math.abs(input.rawStrength) > 1000) return 'pheromone strength must be a finite numerical value.';
  return null;
}

function resolveFinalStrength(input) {
  return input.isRepellent ? -Math.abs(input.rawStrength === 0 ? 1 : input.rawStrength) : Math.abs(input.rawStrength);
}

function pheromoneContent(path, finalStrength) {
  const suffix = finalStrength < 0 ? ' (REPELLENT)' : '';
  return `[PHEROMONE] path=${path} strength=${finalStrength}${suffix}`;
}

function pheromoneAction(finalStrength) {
  return finalStrength < 0 ? 'REPELLENT_PHEROMONE_DEPOSIT' : 'PHEROMONE_DEPOSIT';
}

function pheromoneDetail(path, finalStrength) {
  const qualifier = finalStrength < 0 ? 'repellent ' : '';
  return `Deposited ${qualifier}pheromone on ${path} with strength ${finalStrength}`;
}

function trailHalfLife(context) {
  const halfLife = Number(firstTruthy(context.evaporationHalfLifeMs, context.evaporation_half_life_ms, context.halfLifeMs, 3600000));
  if (!Number.isFinite(halfLife)) return null;
  if (halfLife <= 0) return null;
  return halfLife;
}

function referenceTimestamp(context) {
  const rawRef = firstNonNull(context.referenceTime, context.reference_time);
  const supplied = rawRef == null ? Date.now() : parseSqliteUtcTimestamp(rawRef);
  return Number.isFinite(supplied) ? supplied : Date.now();
}

function trailLimit(context) {
  const rawLimit = firstNonNull(context.traceLimit, context.trace_limit);
  const limit = rawLimit == null ? 1000 : Number(rawLimit);
  if (!Number.isInteger(limit)) return null;
  if (limit < 1) return null;
  if (limit > 10000) return null;
  return limit;
}

function explicitVersion(context) {
  return firstNonNull(context.organizationVersion, context.organization_version, context.version);
}

function trailQuery(version, traceLimit, orchestratorId) {
  const versionFilter = version != null ? 'AND organization_version = ?' : '';
  const queryParams = version != null ? [orchestratorId, version, traceLimit] : [orchestratorId, traceLimit];
  const countParams = version != null ? [orchestratorId, version] : [orchestratorId];
  return { versionFilter, queryParams, countParams };
}

function parsePheromonePayload(row) {
  try {
    const payload = JSON.parse(row.payload_json);
    if (payload.type === 'pheromone' && payload.path) return payload;
    return null;
  } catch (e) {
    return null;
  }
}

function decayedStrength(row, payload, timing) {
  const createdAtMs = parseSqliteUtcTimestamp(row.created_at);
  const ageMs = Math.max(0, timing.referenceTime - createdAtMs);
  const factor = Math.pow(0.5, ageMs / timing.halfLife);
  return Number(payload.strength || 0) * factor;
}

function addStrength(strengths, key, value) {
  strengths[key] = (strengths[key] || 0) + value;
}

function accumulateTrailStrengths(rows, timing) {
  const strengths = {};
  for (const row of rows) {
    const payload = parsePheromonePayload(row);
    if (!payload) continue;
    addStrength(strengths, payload.path, decayedStrength(row, payload, timing));
  }
  return strengths;
}

function rankTrails(trailStrengths, context) {
  const sortedTrails = Object.keys(trailStrengths).sort((a, b) => trailStrengths[b] - trailStrengths[a] || a.localeCompare(b));
  const repellentTrails = sortedTrails.filter(t => trailStrengths[t] < 0);
  const excludeRepellent = Boolean(firstTruthy(context.excludeRepellent, context.exclude_repellent, context.avoidRepellent, context.avoid_repellent));
  const candidateTrails = excludeRepellent ? sortedTrails.filter(t => trailStrengths[t] > 0) : sortedTrails;
  return { sortedTrails, repellentTrails, candidateTrails };
}

function resolveTrailMode(context) {
  const explicit = String(context.mode || context.selection_mode || '').toLowerCase();
  if (explicit) return explicit;
  if (firstTruthy(context.probabilistic, context.alpha !== undefined)) return 'probabilistic';
  if (context.temperature !== undefined) return 'softmax';
  if (context.epsilon !== undefined) return 'epsilon_greedy';
  return 'greedy';
}

function isWeightedMode(mode) {
  return mode === 'probabilistic' || mode === 'roulette' || mode === 'fitness' || mode === 'aco';
}

function softmaxProbabilities(candidateTrails, trailStrengths, rawTemperature) {
  const temperature = Math.max(0.001, Number(firstNonNull(rawTemperature, 1.0)));
  const maxScore = Math.max(...candidateTrails.map(t => trailStrengths[t]));
  const exps = {};
  let sumExp = 0;
  for (const t of candidateTrails) {
    exps[t] = Math.exp((trailStrengths[t] - maxScore) / temperature);
    sumExp += exps[t];
  }
  const probabilities = {};
  for (const t of candidateTrails) {
    probabilities[t] = sumExp > 0 ? (exps[t] / sumExp) : (1 / candidateTrails.length);
  }
  return probabilities;
}

function weightedProbabilities(candidateTrails, trailStrengths, rawAlpha) {
  const alpha = Math.max(0.1, Number(firstNonNull(rawAlpha, 1.0)));
  const weights = {};
  let sumWeights = 0;
  for (const t of candidateTrails) {
    weights[t] = Math.pow(Math.max(0, trailStrengths[t]), alpha);
    sumWeights += weights[t];
  }
  const probabilities = {};
  for (const t of candidateTrails) {
    probabilities[t] = sumWeights > 0 ? (weights[t] / sumWeights) : (1 / candidateTrails.length);
  }
  return probabilities;
}

function epsilonProbabilities(candidateTrails, rawEpsilon) {
  const parsed = Number(firstNonNull(rawEpsilon, 0.1));
  const epsilon = Math.min(1, Math.max(0, Number.isFinite(parsed) ? parsed : 0.1));
  const probabilities = {};
  const bestTrail = candidateTrails[0];
  const n = candidateTrails.length;
  for (const t of candidateTrails) {
    probabilities[t] = (t === bestTrail ? (1 - epsilon) : 0) + (epsilon / n);
  }
  return probabilities;
}

function greedyProbabilities(candidateTrails) {
  const probabilities = {};
  const bestTrail = candidateTrails[0];
  for (const t of candidateTrails) {
    probabilities[t] = t === bestTrail ? 1.0 : 0.0;
  }
  return probabilities;
}

function buildTrailProbabilities(candidateTrails, trailStrengths, selection) {
  const { mode, context } = selection;
  if (mode === 'softmax') return softmaxProbabilities(candidateTrails, trailStrengths, context.temperature);
  if (isWeightedMode(mode)) return weightedProbabilities(candidateTrails, trailStrengths, context.alpha);
  if (mode === 'epsilon_greedy') return epsilonProbabilities(candidateTrails, context.epsilon);
  return greedyProbabilities(candidateTrails);
}

function selectTrail(candidateTrails, probabilities, mode) {
  if (mode === 'greedy') return candidateTrails[0];
  const r = Math.random();
  let cumulative = 0;
  for (const t of candidateTrails) {
    cumulative += probabilities[t];
    if (r <= cumulative) return t;
  }
  return candidateTrails[0];
}

function recordCount(record) {
  if (!record) return 0;
  return Number(record.count || 0);
}

function isTruncated(totalTraceCount, rowCount) {
  return recordCount(totalTraceCount) > rowCount;
}

function evaporationOrchestratorId(context) {
  return firstTruthy(context.orchestratorId, context.orchestrator_id, context.agentId, context.agent_id);
}

function pruneThreshold(context) {
  const raw = firstNonNull(context.pruneThreshold, context.prune_threshold, context.threshold);
  return Math.max(0, Number(firstNonNull(raw, 0.001)));
}

function dryRunFlag(context) {
  return Boolean(firstTruthy(context.dryRun, context.dry_run));
}

function collectEvaporated(rows, timing) {
  const expiredIds = [];
  const remainingStrengths = {};
  for (const row of rows) {
    const payload = parsePheromonePayload(row);
    if (!payload) continue;
    const effectiveStrength = decayedStrength(row, payload, timing);
    if (Math.abs(effectiveStrength) < timing.pruneThreshold) {
      expiredIds.push(row.id);
    } else {
      addStrength(remainingStrengths, payload.path, effectiveStrength);
    }
  }
  return { expiredIds, remainingStrengths };
}

async function purgeExpiredTraces(db, expiredIds) {
  const batchSize = 500;
  for (let i = 0; i < expiredIds.length; i += batchSize) {
    const batch = expiredIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    await db.run(
      `DELETE FROM agent_organization_messages WHERE id IN (${placeholders})`,
      batch
    );
  }
}

module.exports = {
  firstTruthy,
  firstNonNull,
  normalizePheromoneInput,
  validatePheromoneInput,
  resolveFinalStrength,
  pheromoneContent,
  pheromoneAction,
  pheromoneDetail,
  trailHalfLife,
  referenceTimestamp,
  trailLimit,
  explicitVersion,
  trailQuery,
  accumulateTrailStrengths,
  rankTrails,
  resolveTrailMode,
  buildTrailProbabilities,
  selectTrail,
  isTruncated,
  evaporationOrchestratorId,
  pruneThreshold,
  dryRunFlag,
  collectEvaporated,
  purgeExpiredTraces
};

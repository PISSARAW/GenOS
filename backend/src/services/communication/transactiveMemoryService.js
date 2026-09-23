'use strict';

const { getDatabase } = require('../../db');
const { buildAgentSelf } = require('../agentSelfService');

const DEFAULT_WEIGHTS = Object.freeze({
  priorWeight: 0.3,
  verifiedWeight: 0.7,
  unverifiedBoost: 0.2,
  competence: 0.5,
  calibration: 0.2,
  reliability: 0.2,
  freshness: 0.1
});

const MODEL_TIER_COST = Object.freeze({ Flash: 0.1, Pro: 0.5, frontier: 1.0 });

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS agent_expertise (
    agent_id TEXT NOT NULL, domain TEXT NOT NULL,
    competence REAL NOT NULL DEFAULT 0, calibration REAL NOT NULL DEFAULT 0,
    reliability REAL NOT NULL DEFAULT 0, evidence_count INTEGER NOT NULL DEFAULT 0,
    freshness REAL NOT NULL DEFAULT 0, last_success DATETIME,
    capabilities_json TEXT NOT NULL DEFAULT '[]', tools_json TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, domain)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_expertise_domain ON agent_expertise(domain, competence DESC);`);
  return db;
}

function pickNumber(value, fallback) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return fallback;
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function weightsOf(input) {
  return Object.assign({}, DEFAULT_WEIGHTS, input.weights);
}

async function loadSelfFeatures(db, agentId) {
  try {
    const self = await buildAgentSelf(db, agentId);
    const operational = self.operational || {};
    const competence = operational.competence || {};
    const lessons = (self.autobiographical && self.autobiographical.lessons) || [];
    return {
      capabilities: operational.capabilities || [],
      tools: operational.tools || [],
      modelTier: operational.modelTier || 'Flash',
      selfConfidence: pickNumber(competence.confidence, 0.5),
      calibrationObs: pickNumber(competence.calibrationObservations, 0),
      meanAbsError: pickNumber(competence.meanAbsoluteError, 0),
      lessonCount: lessons.length,
      lessonConfidence: averageConfidence(lessons)
    };
  } catch (_) {
    return null;
  }
}

function averageConfidence(lessons) {
  if (lessons.length === 0) return 0;
  const total = lessons.reduce((sum, lesson) => sum + pickNumber(lesson.confidence, 0), 0);
  return total / lessons.length;
}

async function loadEvalStats(db, agentId) {
  try {
    const row = await db.get(
      `SELECT COUNT(*) AS n, AVG(score) AS avg,
              SUM(CASE WHEN score >= 0.7 THEN 1 ELSE 0 END) AS wins,
              MAX(created_at) AS lastAt
       FROM evaluation_runs WHERE agent_id = ? AND score IS NOT NULL`,
      agentId
    );
    return { count: pickNumber(row.n, 0), rate: pickNumber(row.avg, 0), wins: pickNumber(row.wins, 0), lastAt: row.lastAt || null };
  } catch (_) {
    return { count: 0, rate: 0, wins: 0, lastAt: null };
  }
}

async function loadReceiptStats(db, agentId) {
  try {
    const row = await db.get(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM orchestration_action_receipts WHERE orchestrator_id = ?`,
      agentId
    );
    const total = pickNumber(row.n, 0);
    const done = pickNumber(row.done, 0);
    return { count: total, rate: total > 0 ? done / total : 0 };
  } catch (_) {
    return { count: 0, rate: 0 };
  }
}

function pickVerified(evalStats, receiptStats) {
  if (evalStats.count >= 3) return { rate: clamp01(evalStats.rate), count: evalStats.count, lastAt: evalStats.lastAt };
  if (receiptStats.count >= 3) return { rate: clamp01(receiptStats.rate), count: receiptStats.count, lastAt: null };
  return null;
}

function calibrationOf(self) {
  if (self.calibrationObs >= 5) return clamp01(1 - self.meanAbsError);
  return 0.25;
}

function recencyOf(lastAt) {
  if (!lastAt) return 0;
  const days = (Date.now() - new Date(lastAt).getTime()) / 86400000;
  if (days < 0) return 1;
  return 1 / (1 + days);
}

function lastSuccessOf(verified, evalStats) {
  if (verified && verified.lastAt) return verified.lastAt;
  if (evalStats.wins > 0) return evalStats.lastAt;
  return null;
}

function blendExpertise(parts) {
  const verified = pickVerified(parts.evalStats, parts.receiptStats);
  const prior = clamp01(parts.self.selfConfidence);
  const weights = parts.weights;
  let competence = weights.priorWeight * prior;
  let evidence = parts.self.lessonCount;
  if (verified) {
    competence += weights.verifiedWeight * verified.rate;
    evidence += verified.count;
  } else {
    competence += weights.unverifiedBoost * Math.min(1, evidence / 10);
  }
  return {
    competence: clamp01(competence),
    calibration: calibrationOf(parts.self),
    reliability: reliabilityOf(parts.receiptStats, verified),
    evidenceCount: evidence,
    freshness: recencyOf(lastSuccessOf(verified, parts.evalStats)),
    lastSuccess: lastSuccessOf(verified, parts.evalStats)
  };
}

function reliabilityOf(receiptStats, verified) {
  if (receiptStats.count >= 3) return clamp01(receiptStats.rate);
  if (verified) return clamp01(verified.rate);
  return 0.5;
}

function defaultFeatures() {
  return {
    capabilities: [], tools: [], modelTier: 'Flash', selfConfidence: 0.5,
    calibrationObs: 0, meanAbsError: 0, lessonCount: 0, lessonConfidence: 0
  };
}

async function refreshExpertise(input) {
  const db = await ensureTables(input.db);
  const loaded = await loadSelfFeatures(db, input.agentId);
  const self = loaded || defaultFeatures();
  const evalStats = await loadEvalStats(db, input.agentId);
  const receiptStats = await loadReceiptStats(db, input.agentId);
  const blended = blendExpertise({ self, evalStats, receiptStats, weights: weightsOf(input) });
  await db.run(
    `INSERT INTO agent_expertise
      (agent_id, domain, competence, calibration, reliability, evidence_count,
       freshness, last_success, capabilities_json, tools_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(agent_id, domain) DO UPDATE SET
       competence = excluded.competence, calibration = excluded.calibration,
       reliability = excluded.reliability, evidence_count = excluded.evidence_count,
       freshness = excluded.freshness, last_success = excluded.last_success,
       capabilities_json = excluded.capabilities_json, tools_json = excluded.tools_json,
       updated_at = CURRENT_TIMESTAMP`,
    [input.agentId, input.domain, blended.competence, blended.calibration,
      blended.reliability, blended.evidenceCount, blended.freshness, blended.lastSuccess,
      JSON.stringify(self.capabilities), JSON.stringify(self.tools)]
  );
  return getExpertise({ db, agentId: input.agentId, domain: input.domain });
}

async function getExpertise(input) {
  const db = await ensureTables(input.db);
  const row = await db.get(
    'SELECT * FROM agent_expertise WHERE agent_id = ? AND domain = ?',
    [input.agentId, input.domain]
  );
  if (!row) return null;
  return deserializeExpertise(row);
}

function deserializeExpertise(row) {
  return {
    agentId: row.agent_id,
    domain: row.domain,
    competence: Number(row.competence),
    calibration: Number(row.calibration),
    reliability: Number(row.reliability),
    evidenceCount: Number(row.evidence_count),
    freshness: Number(row.freshness),
    lastSuccess: row.last_success,
    capabilities: JSON.parse(row.capabilities_json || '[]'),
    tools: JSON.parse(row.tools_json || '[]'),
    updatedAt: row.updated_at
  };
}

async function recordOutcome(input) {
  const db = await ensureTables(input.db);
  const current = await getExpertise({ db, agentId: input.agentId, domain: input.domain });
  const prior = current || emptyExpertise(input);
  const weight = pickNumber(input.weight, 1);
  const total = prior.evidenceCount + weight;
  const success = input.success ? weight : 0;
  const competence = (prior.competence * prior.evidenceCount + success) / total;
  await db.run(
    `INSERT INTO agent_expertise
      (agent_id, domain, competence, calibration, reliability, evidence_count,
       freshness, last_success, capabilities_json, tools_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(agent_id, domain) DO UPDATE SET
       competence = excluded.competence, evidence_count = excluded.evidence_count,
       freshness = excluded.freshness, last_success = excluded.last_success,
       updated_at = CURRENT_TIMESTAMP`,
    [input.agentId, input.domain, clamp01(competence), prior.calibration,
      prior.reliability, total, input.success ? 1 : prior.freshness,
      input.success ? new Date().toISOString() : prior.lastSuccess,
      JSON.stringify(prior.capabilities), JSON.stringify(prior.tools)]
  );
  return getExpertise({ db, agentId: input.agentId, domain: input.domain });
}

function emptyExpertise(input) {
  return {
    competence: 0.3, calibration: 0.25, reliability: 0.5, evidenceCount: 0,
    freshness: 0, lastSuccess: null, capabilities: [], tools: []
  };
}

function scoreExpert(row, weights) {
  return weights.competence * row.competence + weights.calibration * row.calibration
    + weights.reliability * row.reliability + weights.freshness * row.freshness;
}

function tierCostOf(modelTier) {
  const known = MODEL_TIER_COST[modelTier];
  if (known === undefined) return 0.5;
  return known;
}

function hasTools(row, required) {
  if (required.length === 0) return true;
  const owned = new Set(row.tools);
  for (const tool of required) {
    if (!owned.has(tool)) return false;
  }
  return true;
}

function hasCapability(row, capability) {
  if (!capability) return true;
  return row.capabilities.indexOf(capability) >= 0;
}

async function independenceRows(db, agentIds) {
  if (agentIds.length === 0) return [];
  const marks = agentIds.map(() => '?').join(',');
  return db.all(
    `SELECT source_agent_id AS s, target_agent_id AS t, epistemic_independence AS ei
     FROM agent_relations WHERE source_agent_id IN (${marks}) OR target_agent_id IN (${marks})`,
    [...agentIds, ...agentIds]
  );
}

function minIndependence(candidateId, rows, fromIds) {
  let floor = 1;
  for (const row of rows) {
    const involves = (row.s === candidateId && fromIds.indexOf(row.t) >= 0)
      || (row.t === candidateId && fromIds.indexOf(row.s) >= 0);
    if (involves && Number(row.ei) < floor) floor = Number(row.ei);
  }
  return floor;
}

function deserializeCandidate(row, weights) {
  const base = deserializeExpertise(row);
  return Object.assign(base, {
    score: scoreExpert(base, weights),
    modelTier: row.model_tier || 'Flash',
    tierCost: tierCostOf(row.model_tier || 'Flash')
  });
}

function filtersOf(input, relations) {
  return {
    capability: input.capability, required: input.requiredTools || [],
    maxCost: input.maxCost === undefined ? null : input.maxCost,
    fromIds: input.independenceFrom || [], relations,
    threshold: pickNumber(input.independenceThreshold, 0.5)
  };
}

function keepCandidate(candidate, filters) {
  if (!hasCapability(candidate, filters.capability)) return false;
  if (!hasTools(candidate, filters.required)) return false;
  if (filters.maxCost !== null && candidate.tierCost > filters.maxCost) return false;
  if (filters.fromIds.length > 0
    && minIndependence(candidate.agentId, filters.relations, filters.fromIds) < filters.threshold) return false;
  return true;
}

async function findExperts(input) {
  const db = await ensureTables(input.db);
  const weights = weightsOf(input);
  const rows = await db.all(
    `SELECT e.*, a.model_tier AS model_tier FROM agent_expertise e
     LEFT JOIN agents a ON a.id = e.agent_id WHERE e.domain = ?
     ORDER BY e.competence DESC LIMIT 200`,
    input.domain
  );
  const filters = filtersOf(input, await independenceRows(db, input.independenceFrom || []));
  const matches = [];
  for (const row of rows) {
    const candidate = deserializeCandidate(row, weights);
    if (keepCandidate(candidate, filters)) matches.push(candidate);
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, pickNumber(input.count, 3));
}

module.exports = {
  DEFAULT_WEIGHTS,
  ensureTables,
  refreshExpertise,
  getExpertise,
  recordOutcome,
  findExperts
};

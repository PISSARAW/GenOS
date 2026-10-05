'use strict';

const crypto = require('node:crypto');
const modelProvider = require('./modelProvider');
const { appendEvent } = require('./gvxDevelopmentLedger');

const TABLES = `
CREATE TABLE IF NOT EXISTS cognitive_projection_samples (
  id TEXT PRIMARY KEY, model TEXT NOT NULL, task TEXT NOT NULL,
  representation TEXT NOT NULL, tokens INTEGER NOT NULL, bytes INTEGER NOT NULL,
  latency_ms REAL, cost_usd REAL, quality REAL, evidence_digest TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cognitive_projection_samples_lookup
  ON cognitive_projection_samples(model, task, representation);
CREATE TABLE IF NOT EXISTS cognitive_projection_policies (
  model TEXT NOT NULL, task TEXT NOT NULL, version INTEGER NOT NULL,
  representation TEXT NOT NULL, baseline_representation TEXT NOT NULL,
  status TEXT NOT NULL, reason TEXT, candidate_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY(model, task)
);`;

function bounded(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validQuality(value) {
  const quality = Number(value);
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : null;
}

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

async function ensure(db) {
  if (!db || typeof db.exec !== 'function') return;
  await db.exec(TABLES);
}

function countTokens(text) {
  if (typeof modelProvider.tokenize === 'function') {
    const tokens = modelProvider.tokenize(String(text));
    if (Array.isArray(tokens)) return tokens.length;
  }
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function sample(input) {
  const prompt = String(input.prompt || '');
  if (!prompt) throw new Error('projection_profile_prompt_required');
  const quality = validQuality(input.quality);
  return { id: input.id || crypto.randomUUID(), model: String(input.model || 'unknown-model'),
    task: String(input.task || 'runtime'), representation: String(input.representation || 'portable'),
    tokens: countTokens(prompt), bytes: Buffer.byteLength(prompt, 'utf8'),
    latencyMs: bounded(input.latencyMs, null), costUsd: bounded(input.costUsd, null), quality,
    evidenceDigest: input.evidenceDigest || null, createdAt: new Date().toISOString() };
}

async function record(db, input) {
  const value = sample(input);
  await ensure(db);
  await db.run(`INSERT INTO cognitive_projection_samples
    (id, model, task, representation, tokens, bytes, latency_ms, cost_usd, quality, evidence_digest, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, value.id, value.model, value.task, value.representation,
  value.tokens, value.bytes, value.latencyMs, value.costUsd, value.quality, value.evidenceDigest, value.createdAt);
  return value;
}

function aggregate(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const item = groups.get(row.representation) || { representation: row.representation, samples: 0,
      tokens: 0, latencyMs: 0, costUsd: 0, qualityTotal: 0, qualitySamples: 0 };
    item.samples += 1; item.tokens += Number(row.tokens || 0);
    item.latencyMs += Number(row.latency_ms || 0); item.costUsd += Number(row.cost_usd || 0);
    if (row.quality !== null && row.quality !== undefined) {
      item.qualityTotal += Number(row.quality); item.qualitySamples += 1;
    }
    groups.set(row.representation, item);
  });
  return [...groups.values()].map((item) => ({ ...item,
    avgTokens: item.tokens / item.samples, avgLatencyMs: item.latencyMs / item.samples,
    avgCostUsd: item.costUsd / item.samples,
    avgQuality: item.qualitySamples ? item.qualityTotal / item.qualitySamples : null,
    qualityCoverage: item.qualitySamples / item.samples }));
}

async function profile(db, input) {
  await ensure(db);
  const rows = await db.all(`SELECT representation, tokens, latency_ms, cost_usd, quality
    FROM cognitive_projection_samples WHERE model = ? AND task = ?`,
  String(input.model || 'unknown-model'), String(input.task || 'runtime'));
  return aggregate(rows);
}

function score(item, baseline) {
  const quality = item.avgQuality === null ? 0 : item.avgQuality;
  const baselineQuality = baseline?.avgQuality === null || baseline?.avgQuality === undefined
    ? 0 : baseline.avgQuality;
  if (item.qualitySamples === 0 || quality < baselineQuality) return null;
  return (item.avgTokens / Math.max(1, baseline?.avgTokens || item.avgTokens)) * 0.4
    + (item.avgLatencyMs / Math.max(1, baseline?.avgLatencyMs || item.avgLatencyMs)) * 0.3
    + (item.avgCostUsd / Math.max(0.000001, baseline?.avgCostUsd || item.avgCostUsd)) * 0.3;
}

async function select(db, input = {}) {
  await ensure(db);
  const model = String(input.model || 'unknown-model');
  const task = String(input.task || 'runtime');
  const policy = await db.get('SELECT * FROM cognitive_projection_policies WHERE model = ? AND task = ?', model, task);
  const items = await profile(db, input);
  const baselineName = input.baselineRepresentation || 'portable';
  if (policy?.status === 'rolled_back') {
    return { representation: baselineName, source: 'gvx_rollback', profile: items.find((item) => item.representation === baselineName) || null,
      candidates: [] };
  }
  if (policy?.status === 'active') {
    const active = items.find((item) => item.representation === policy.representation);
    if (active && active.qualitySamples && active.avgQuality >= 0) {
      return { representation: active.representation, source: 'pgo_policy', profile: active, candidates: [] };
    }
  }
  const baseline = items.find((item) => item.representation === baselineName);
  const candidates = items.map((item) => ({ item, score: score(item, baseline) }))
    .filter((entry) => entry.score !== null && entry.item.samples >= Number(input.minSamples || 3));
  candidates.sort((left, right) => left.score - right.score);
  const chosen = candidates[0]?.item;
  return { representation: chosen?.representation || baselineName,
    source: chosen ? 'empirical' : 'baseline', profile: chosen || baseline || null,
    candidates: candidates.map((entry) => ({ representation: entry.item.representation, score: entry.score })) };
}

function eventInput(input, representation, candidateHash) {
  const organizationId = String(input.organizationId || 'local');
  const projectId = String(input.projectId || 'cognitive-projection');
  const entityId = String(input.entityId || `${input.model}:${input.task}`);
  const parentHash = crypto.createHash('sha256').update(`${organizationId}:${projectId}:${entityId}`).digest('hex');
  return { organizationId, projectId, entityId, parentHash, candidateHash, representation };
}

async function apply(db, input) {
  const selected = await select(db, input);
  if (selected.source !== 'empirical' || selected.representation === (input.baselineRepresentation || 'portable')) {
    return { status: 'blocked', reason: 'projection_candidate_not_proven', selected };
  }
  await ensure(db);
  const candidateHash = digest({ model: input.model, task: input.task, representation: selected.representation });
  const current = await db.get('SELECT * FROM cognitive_projection_policies WHERE model = ? AND task = ?',
    String(input.model), String(input.task));
  const version = Number(current?.version || 0) + 1;
  const now = new Date().toISOString();
  await db.run(`INSERT INTO cognitive_projection_policies
    (model, task, version, representation, baseline_representation, status, reason, candidate_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(model, task) DO UPDATE SET version = excluded.version, representation = excluded.representation,
      status = 'active', reason = excluded.reason, candidate_hash = excluded.candidate_hash, updated_at = excluded.updated_at`,
  String(input.model), String(input.task), version, selected.representation, input.baselineRepresentation || 'portable',
  'empirical_pgo', candidateHash, now);
  if (input.gvxScope) await appendEvent(db, { ...eventInput({ ...input, ...input.gvxScope }, selected.representation, candidateHash),
    type: 'application_recorded', payload: { kind: 'projection_pgo', version, profile: selected.profile } });
  return { status: 'active', version, representation: selected.representation, candidateHash, selected };
}

async function rollback(db, input) {
  await ensure(db);
  const current = await db.get('SELECT * FROM cognitive_projection_policies WHERE model = ? AND task = ?',
    String(input.model), String(input.task));
  if (!current) return { status: 'blocked', reason: 'projection_policy_missing' };
  const baseline = current.baseline_representation || 'portable';
  const version = Number(current.version || 0) + 1;
  const candidateHash = digest({ model: input.model, task: input.task, representation: baseline, version });
  await db.run(`UPDATE cognitive_projection_policies SET version = ?, representation = ?, status = 'rolled_back',
    reason = ?, candidate_hash = ?, updated_at = ? WHERE model = ? AND task = ?`, version, baseline,
  String(input.reason || 'pgo_regression'), candidateHash, new Date().toISOString(), String(input.model), String(input.task));
  if (input.gvxScope) await appendEvent(db, { ...eventInput({ ...input, ...input.gvxScope }, baseline, candidateHash),
    type: 'rollback_recorded', payload: { kind: 'projection_pgo_rollback', version, reason: input.reason || 'pgo_regression' } });
  return { status: 'rolled_back', version, representation: baseline, candidateHash };
}

module.exports = { ensure, countTokens, record, profile, select, apply, rollback };

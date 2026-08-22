const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function scopedRelease(db, req, releaseId) {
  const scope = scopeSql(req);
  return db.get(`SELECT * FROM releases WHERE id = ? AND ${scope.clause}`, releaseId, ...scope.params);
}

async function list(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    res.json(await db.all(`SELECT * FROM releases WHERE ${scope.clause} ORDER BY created_at DESC`, ...scope.params));
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const db = await getDatabase();
    const { workflowId, version = 1, environment = 'staging', traffic = 100 } = req.body || {};
    if (!workflowId) return res.status(400).json({ error: { code: 'INVALID_WORKFLOW', message: 'workflowId is required.' } });
    const scope = scopeSql(req);
    const workflow = await db.get(`SELECT id FROM workflows WHERE id = ? AND ${scope.clause}`, workflowId, ...scope.params);
    if (!workflow) return res.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow is outside the tenant scope.' } });
    const releaseId = id('rel');
    await db.run('INSERT INTO releases(id,workflow_id,version,environment,traffic,status,organization_id,project_id) VALUES(?,?,?,?,?,?,?,?)', releaseId, workflowId, version, environment, traffic, 'pending', ...scope.params);
    res.status(201).json({ id: releaseId, workflowId, version, environment, traffic, status: 'pending' });
  } catch (error) { next(error); }
}

async function promote(req, res, next) {
  try {
    const db = await getDatabase();
    const release = await scopedRelease(db, req, req.params.id);
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    const active = await db.get("SELECT id FROM release_rollouts WHERE release_id = ? AND status = 'running'", release.id);
    if (active) return res.status(409).json({ error: { code: 'ROLLOUT_IN_PROGRESS', message: 'Decide the active rollout before promotion.' } });
    const environment = req.body?.environment || 'production';
    const scope = scopeSql(req);
    await db.run(`UPDATE releases SET environment = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, environment, 'active', release.id, ...scope.params);
    res.json({ id: release.id, status: 'active', environment });
  } catch (error) { next(error); }
}

async function rollback(req, res, next) {
  try {
    const db = await getDatabase();
    const release = await scopedRelease(db, req, req.params.id);
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    const scope = scopeSql(req);
    await db.run(`UPDATE releases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, 'rolled_back', release.id, ...scope.params);
    await db.run("UPDATE release_rollouts SET status = 'rolled_back', updated_at = CURRENT_TIMESTAMP WHERE release_id = ? AND status = 'running'", release.id);
    res.json({ id: release.id, status: 'rolled_back' });
  } catch (error) { next(error); }
}

async function createRollout(req, res, next) {
  try {
    const db = await getDatabase();
    const release = await scopedRelease(db, req, req.params.id);
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    const strategy = String(req.body?.strategy || 'canary').toLowerCase();
    if (!['canary', 'ab'].includes(strategy)) return res.status(400).json({ error: { code: 'INVALID_ROLLOUT_STRATEGY', message: 'strategy must be canary or ab.' } });
    const config = {
      variants: req.body?.variants || (strategy === 'canary' ? [{ name: 'stable', traffic: 95 }, { name: 'canary', traffic: 5 }] : [{ name: 'control', traffic: 50 }, { name: 'candidate', traffic: 50 }]),
      slo: req.body?.slo || { maxErrorRate: 0.01, maxP95LatencyMs: 3000, minRequests: 100 }
    };
    const traffic = config.variants.reduce((total, variant) => total + number(variant.traffic), 0);
    if (config.variants.length < 2 || Math.abs(traffic - 100) > 0.001 || config.variants.some(variant => !variant.name || number(variant.traffic) < 0)) {
      return res.status(400).json({ error: { code: 'INVALID_VARIANTS', message: 'At least two named variants with traffic totaling 100 are required.' } });
    }
    const rolloutId = id('rollout');
    const scope = scopeSql(req);
    await db.run('INSERT INTO release_rollouts(id,release_id,organization_id,project_id,strategy,config_json) VALUES(?,?,?,?,?,?)', rolloutId, release.id, ...scope.params, strategy, JSON.stringify(config));
    for (const variant of config.variants) await db.run('INSERT INTO release_rollout_metrics(rollout_id,variant) VALUES(?,?)', rolloutId, variant.name);
    res.status(201).json({ id: rolloutId, releaseId: release.id, strategy, status: 'running', ...config });
  } catch (error) { next(error); }
}

async function recordRolloutMetric(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rollout = await db.get(`SELECT * FROM release_rollouts WHERE id = ? AND ${scope.clause}`, req.params.rolloutId, ...scope.params);
    if (!rollout) return res.status(404).json({ error: { code: 'ROLLOUT_NOT_FOUND', message: 'Rollout is outside the tenant scope.' } });
    if (rollout.status !== 'running') return res.status(409).json({ error: { code: 'ROLLOUT_CLOSED', message: 'Metrics can only be recorded on a running rollout.' } });
    const { variant, requests = 0, errors = 0, latencyMs = 0, tokens = 0, costUsd = 0 } = req.body || {};
    const metric = await db.get('SELECT variant FROM release_rollout_metrics WHERE rollout_id = ? AND variant = ?', rollout.id, variant);
    if (!metric) return res.status(400).json({ error: { code: 'UNKNOWN_VARIANT', message: 'variant is not configured for this rollout.' } });
    const requestCount = Math.max(0, Math.floor(number(requests)));
    const errorCount = Math.min(requestCount, Math.max(0, Math.floor(number(errors))));
    await db.run(`UPDATE release_rollout_metrics SET requests = requests + ?, errors = errors + ?, latency_ms_total = latency_ms_total + ?, tokens = tokens + ?, cost_usd = cost_usd + ?, updated_at = CURRENT_TIMESTAMP WHERE rollout_id = ? AND variant = ?`, requestCount, errorCount, Math.max(0, number(latencyMs)) * requestCount, Math.max(0, Math.floor(number(tokens))), Math.max(0, number(costUsd)), rollout.id, variant);
    await db.run('INSERT INTO usage_ledger(id,organization_id,project_id,release_id,category,quantity,cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?)', id('usage'), ...scope.params, rollout.release_id, 'rollout', requestCount, Math.max(0, number(costUsd)), JSON.stringify({ rolloutId: rollout.id, variant, tokens: Math.max(0, Math.floor(number(tokens))) }));
    res.status(202).json({ rolloutId: rollout.id, variant, accepted: true });
  } catch (error) { next(error); }
}

function decide(metrics, config) {
  const policy = config.slo || {};
  const totalRequests = metrics.reduce((sum, metric) => sum + metric.requests, 0);
  const totalErrors = metrics.reduce((sum, metric) => sum + metric.errors, 0);
  const errorRate = totalRequests ? totalErrors / totalRequests : 0;
  const averageLatencyMs = totalRequests ? metrics.reduce((sum, metric) => sum + metric.latency_ms_total, 0) / totalRequests : 0;
  const minRequests = Math.max(1, number(policy.minRequests, 100));
  if (totalRequests < minRequests) return { status: 'paused', reason: 'insufficient_sample', totalRequests, errorRate, averageLatencyMs };
  if (errorRate > number(policy.maxErrorRate, 0.01) || averageLatencyMs > number(policy.maxP95LatencyMs, 3000)) return { status: 'rolled_back', reason: 'slo_breach', totalRequests, errorRate, averageLatencyMs };
  const winner = [...metrics].sort((left, right) => (left.errors / Math.max(1, left.requests)) - (right.errors / Math.max(1, right.requests)) || (left.latency_ms_total / Math.max(1, left.requests)) - (right.latency_ms_total / Math.max(1, right.requests)))[0]?.variant;
  return { status: 'promoted', reason: 'slo_satisfied', selectedVariant: winner, totalRequests, errorRate, averageLatencyMs };
}

async function decideRollout(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rollout = await db.get(`SELECT * FROM release_rollouts WHERE id = ? AND ${scope.clause}`, req.params.rolloutId, ...scope.params);
    if (!rollout) return res.status(404).json({ error: { code: 'ROLLOUT_NOT_FOUND', message: 'Rollout is outside the tenant scope.' } });
    const metrics = await db.all('SELECT * FROM release_rollout_metrics WHERE rollout_id = ? ORDER BY variant', rollout.id);
    const outcome = decide(metrics, JSON.parse(rollout.config_json));
    await db.run('UPDATE release_rollouts SET status = ?, decision_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', outcome.status, JSON.stringify(outcome), rollout.id);
    if (outcome.status === 'promoted') await db.run("UPDATE releases SET status = 'active', environment = 'production', updated_at = CURRENT_TIMESTAMP WHERE id = ?", rollout.release_id);
    if (outcome.status === 'rolled_back') await db.run("UPDATE releases SET status = 'rolled_back', updated_at = CURRENT_TIMESTAMP WHERE id = ?", rollout.release_id);
    res.json({ id: rollout.id, strategy: rollout.strategy, metrics, ...outcome });
  } catch (error) { next(error); }
}

async function listRollouts(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rollouts = await db.all(`SELECT * FROM release_rollouts WHERE ${scope.clause} ORDER BY created_at DESC`, ...scope.params);
    const output = await Promise.all(rollouts.map(async rollout => ({ ...rollout, config: JSON.parse(rollout.config_json), decision: rollout.decision_json ? JSON.parse(rollout.decision_json) : null, metrics: await db.all('SELECT variant,requests,errors,latency_ms_total AS latencyMsTotal,tokens,cost_usd AS costUsd FROM release_rollout_metrics WHERE rollout_id = ?', rollout.id) })));
    res.json(output);
  } catch (error) { next(error); }
}

async function chargeback(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rows = await db.all(`SELECT category, COUNT(*) AS entries, SUM(quantity) AS quantity, SUM(cost_usd) AS costUsd FROM usage_ledger WHERE ${scope.clause} GROUP BY category ORDER BY costUsd DESC`, ...scope.params);
    res.json({ organizationId: req.tenant.organizationId, projectId: req.tenant.projectId, totalCostUsd: rows.reduce((sum, row) => sum + number(row.costUsd), 0), categories: rows });
  } catch (error) { next(error); }
}

module.exports = { list, create, promote, rollback, createRollout, recordRolloutMetric, decideRollout, listRollouts, chargeback, decide };

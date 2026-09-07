const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredNumber(value, field, { integer = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < min || parsed > max) {
    const error = new Error(`${field} must be a finite ${integer ? 'integer' : 'number'} between ${min} and ${max}.`);
    error.code = 'INVALID_RELEASE_ARGUMENT';
    throw error;
  }
  return parsed;
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
    if (typeof workflowId !== 'string' || !workflowId.trim()) return res.status(400).json({ error: { code: 'INVALID_WORKFLOW', message: 'workflowId must be a non-empty string.' } });
    let validatedVersion;
    let validatedTraffic;
    if (!['staging', 'production'].includes(environment)) return res.status(400).json({ error: { code: 'INVALID_ENVIRONMENT', message: 'environment must be staging or production.' } });
    try {
      validatedVersion = requiredNumber(version, 'version', { integer: true, min: 1, max: 1_000_000_000 });
      validatedTraffic = requiredNumber(traffic, 'traffic', { min: 0, max: 100 });
    } catch (error) {
      return res.status(400).json({ error: { code: error.code, message: error.message } });
    }
    const scope = scopeSql(req);
    const workflow = await db.get(`SELECT id FROM workflows WHERE id = ? AND ${scope.clause}`, workflowId, ...scope.params);
    if (!workflow) return res.status(404).json({ error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow is outside the tenant scope.' } });
    const workflowVersion = await db.get('SELECT version FROM workflow_versions WHERE workflow_id = ? AND version = ?', workflowId, validatedVersion);
    if (!workflowVersion) return res.status(404).json({ error: { code: 'WORKFLOW_VERSION_NOT_FOUND', message: `Workflow version ${validatedVersion} does not exist.` } });
    const duplicate = await db.get(`SELECT id FROM releases WHERE workflow_id = ? AND version = ? AND environment = ? AND ${scope.clause}`, workflowId, validatedVersion, environment, ...scope.params);
    if (duplicate) return res.status(409).json({ error: { code: 'RELEASE_ALREADY_EXISTS', message: 'A release for this workflow version and environment already exists.' }, id: duplicate.id });
    const releaseId = id('rel');
    await db.run('INSERT INTO releases(id,workflow_id,version,environment,traffic,status,organization_id,project_id) VALUES(?,?,?,?,?,?,?,?)', releaseId, workflowId, validatedVersion, environment, validatedTraffic, 'pending', ...scope.params);
    res.status(201).json({ id: releaseId, workflowId, version: validatedVersion, environment, traffic: validatedTraffic, status: 'pending' });
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
    if (!['staging', 'production'].includes(environment)) return res.status(400).json({ error: { code: 'INVALID_ENVIRONMENT', message: 'environment must be staging or production.' } });

    if (environment === 'production') {
      if (['draft', 'pending', 'failed', 'rolled_back'].includes(release.status)) {
        return res.status(400).json({ error: { code: 'INVALID_RELEASE_STATUS', message: `Cannot promote release in status ${release.status} to production.` } });
      }

      const promotedRollout = await db.get("SELECT id FROM release_rollouts WHERE release_id = ? AND status = 'promoted'", release.id);
      const isOverride = req.body?.force === true && typeof req.body?.overrideReason === 'string' && req.body.overrideReason.length > 0;

      if (!promotedRollout && !isOverride) {
        return res.status(403).json({ error: { code: 'ROLLOUT_REQUIRED', message: 'Promotion to production requires a successful rollout or an explicit force override with overrideReason.' } });
      }
    }

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
    if (release.status === 'rolled_back') return res.status(409).json({ error: { code: 'RELEASE_ALREADY_ROLLED_BACK', message: 'Release is already rolled back.' } });
    return res.status(501).json({ error: { code: 'RELEASE_ROLLBACK_UNAVAILABLE', message: 'Release rollback requires a deployment adapter; no production state was changed.' }, id: release.id });
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
      slo: req.body?.slo || { maxErrorRate: 0.01, maxAverageLatencyMs: 3000, minRequests: 100 }
    };
    if (!Array.isArray(config.variants) || config.variants.length < 2 || config.variants.some((variant) => !variant || typeof variant.name !== 'string' || !variant.name.trim())) {
      return res.status(400).json({ error: { code: 'INVALID_VARIANTS', message: 'At least two named variants with traffic totaling 100 are required.' } });
    }
    const variantNames = config.variants.map((variant) => variant.name.trim());
    if (new Set(variantNames).size !== variantNames.length) return res.status(400).json({ error: { code: 'INVALID_VARIANTS', message: 'Variant names must be unique.' } });
    let traffic;
    try {
      config.variants = config.variants.map((variant) => ({ ...variant, name: variant.name.trim(), traffic: requiredNumber(variant.traffic, 'variant traffic', { min: 0, max: 100 }) }));
      traffic = config.variants.reduce((total, variant) => total + variant.traffic, 0);
      if (Math.abs(traffic - 100) > 0.001) throw new Error('Variant traffic must total 100.');
      const slo = config.slo;
      if (!slo || typeof slo !== 'object' || Array.isArray(slo)) throw new Error('slo must be an object.');
      requiredNumber(slo.maxErrorRate, 'maxErrorRate', { min: 0, max: 1 });
      requiredNumber(slo.maxAverageLatencyMs, 'maxAverageLatencyMs', { min: 0, max: 86_400_000 });
      requiredNumber(slo.minRequests, 'minRequests', { integer: true, min: 1, max: 1_000_000_000 });
    } catch (error) {
      return res.status(400).json({ error: { code: 'INVALID_VARIANTS', message: error.message } });
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
    if (rollout.status !== 'running' && rollout.status !== 'paused') return res.status(409).json({ error: { code: 'ROLLOUT_CLOSED', message: 'Metrics can only be recorded on a running or paused rollout.' } });
    const { variant, requests = 0, errors = 0, latencyMs = 0, tokens = 0, costUsd = 0 } = req.body || {};
    if (typeof variant !== 'string' || !variant.trim()) return res.status(400).json({ error: { code: 'INVALID_VARIANT', message: 'variant must be a non-empty string.' } });
    let validatedRequests;
    let validatedErrors;
    let validatedLatency;
    let validatedTokens;
    let validatedCost;
    try {
      validatedRequests = requiredNumber(requests, 'requests', { integer: true, min: 0, max: 1_000_000_000 });
      validatedErrors = requiredNumber(errors, 'errors', { integer: true, min: 0, max: validatedRequests });
      validatedLatency = requiredNumber(latencyMs, 'latencyMs', { min: 0, max: 86_400_000 });
      validatedTokens = requiredNumber(tokens, 'tokens', { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
      validatedCost = requiredNumber(costUsd, 'costUsd', { min: 0, max: Number.MAX_SAFE_INTEGER });
    } catch (error) {
      return res.status(400).json({ error: { code: error.code, message: error.message } });
    }
    const metric = await db.get('SELECT variant FROM release_rollout_metrics WHERE rollout_id = ? AND variant = ?', rollout.id, variant);
    if (!metric) return res.status(400).json({ error: { code: 'UNKNOWN_VARIANT', message: 'variant is not configured for this rollout.' } });
    const requestCount = validatedRequests;
    const errorCount = validatedErrors;
    await db.run(`UPDATE release_rollout_metrics SET requests = requests + ?, errors = errors + ?, latency_ms_total = latency_ms_total + ?, tokens = tokens + ?, cost_usd = cost_usd + ?, updated_at = CURRENT_TIMESTAMP WHERE rollout_id = ? AND variant = ?`, requestCount, errorCount, validatedLatency * requestCount, validatedTokens, validatedCost, rollout.id, variant);
    await db.run('INSERT INTO usage_ledger(id,organization_id,project_id,release_id,category,quantity,cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?)', id('usage'), ...scope.params, rollout.release_id, 'rollout', requestCount, validatedCost, JSON.stringify({ rolloutId: rollout.id, variant, tokens: validatedTokens }));
    if (rollout.status === 'paused' && requestCount > 0) {
      await db.run("UPDATE release_rollouts SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?", rollout.id);
    }
    res.status(202).json({ rolloutId: rollout.id, variant, accepted: true });
  } catch (error) { next(error); }
}

function decide(metrics, config, strategy = 'canary') {
  const policy = config.slo || {};
  const totalRequests = metrics.reduce((sum, metric) => sum + metric.requests, 0);
  
  const candidateVariantName = (config.variants && config.variants.length > 1) ? config.variants[config.variants.length - 1].name : (strategy === 'canary' ? 'canary' : 'candidate');
  const candidateMetric = metrics.find(m => m.variant === candidateVariantName) || { requests: 0, errors: 0, latency_ms_total: 0 };
  
  const candidateRequests = candidateMetric.requests;
  const errorRate = candidateRequests ? candidateMetric.errors / candidateRequests : 0;
  const averageLatencyMs = candidateRequests ? candidateMetric.latency_ms_total / candidateRequests : 0;
  
  const minRequests = Math.max(1, number(policy.minRequests, 100));
  if (totalRequests < minRequests) return { status: 'paused', reason: 'insufficient_sample', totalRequests, errorRate, averageLatencyMs };
  if (errorRate > number(policy.maxErrorRate, 0.01) || averageLatencyMs > number(policy.maxAverageLatencyMs, 3000)) return { status: 'rolled_back', reason: 'slo_breach', totalRequests, errorRate, averageLatencyMs, latencyMetric: 'average' };
  
  const winner = [...metrics].sort((left, right) => (left.errors / Math.max(1, left.requests)) - (right.errors / Math.max(1, right.requests)) || (left.latency_ms_total / Math.max(1, left.requests)) - (right.latency_ms_total / Math.max(1, right.requests)))[0]?.variant;
  
  if (strategy === 'canary' && winner === 'stable') {
    return { status: 'rolled_back', reason: 'candidate_underperformed', selectedVariant: winner, totalRequests, errorRate, averageLatencyMs, latencyMetric: 'average' };
  }
  
  return { status: 'promoted', reason: 'slo_satisfied', selectedVariant: winner, totalRequests, errorRate, averageLatencyMs, latencyMetric: 'average' };
}

async function decideRollout(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rollout = await db.get(`SELECT * FROM release_rollouts WHERE id = ? AND ${scope.clause}`, req.params.rolloutId, ...scope.params);
    if (!rollout) return res.status(404).json({ error: { code: 'ROLLOUT_NOT_FOUND', message: 'Rollout is outside the tenant scope.' } });
    const metrics = await db.all('SELECT * FROM release_rollout_metrics WHERE rollout_id = ? ORDER BY variant', rollout.id);
    const outcome = decide(metrics, JSON.parse(rollout.config_json), rollout.strategy);
    await db.run(`UPDATE release_rollouts SET status = ?, decision_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, outcome.status, JSON.stringify(outcome), rollout.id, ...scope.params);
    if (outcome.status === 'promoted') await db.run(`UPDATE releases SET status = 'active', environment = 'production', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, rollout.release_id, ...scope.params);
    if (outcome.status === 'rolled_back') await db.run(`UPDATE releases SET status = 'rolled_back', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, rollout.release_id, ...scope.params);
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

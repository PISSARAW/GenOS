const crypto = require('crypto');
const { getDatabase, withTransaction } = require('../db');
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

function validateEnvironment(environment) {
  if (!['staging', 'production'].includes(environment)) return { code: 'INVALID_ENVIRONMENT', message: 'environment must be staging or production.' };
  return null;
}

function checkActiveRollout(db, releaseId) {
  return db.get("SELECT id FROM release_rollouts WHERE release_id = ? AND status = 'running'", releaseId);
}

function checkPromotedRollout(db, releaseId) {
  return db.get("SELECT id FROM release_rollouts WHERE release_id = ? AND status = 'promoted'", releaseId);
}

function isProductionOverride(req) {
  return req.body?.force === true && typeof req.body?.overrideReason === 'string' && req.body.overrideReason.length > 0;
}

function validateProductionPromotion(release, promotedRollout, isOverride) {
  if (['draft', 'pending', 'failed', 'rolled_back'].includes(release.status)) {
    return { code: 'INVALID_RELEASE_STATUS', message: `Cannot promote release in status ${release.status} to production.` };
  }
  if (!promotedRollout && !isOverride) {
    return { code: 'ROLLOUT_REQUIRED', message: 'Promotion to production requires a successful rollout or an explicit force override with overrideReason.' };
  }
  return null;
}

async function updateReleaseEnvironment(db, { releaseId, environment, scope }) {
  const updated = await db.run(`UPDATE releases SET environment = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, environment, 'active', releaseId, ...scope.params);
  if (updated.changes !== 1) return { error: { code: 'RELEASE_STATE_CHANGED', message: 'Release changed before promotion could be applied.' } };
  return { id: releaseId, status: 'active', environment };
}

async function promote(req, res, next) {
  try {
    const db = await getDatabase();
    const release = await scopedRelease(db, req, req.params.id);
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    
    const activeRollout = await checkActiveRollout(db, release.id);
    if (activeRollout) return res.status(409).json({ error: { code: 'ROLLOUT_IN_PROGRESS', message: 'Decide the active rollout before promotion.' } });
    
    const environment = req.body?.environment || 'production';
    const envError = validateEnvironment(environment);
    if (envError) return res.status(400).json({ error: envError });
    
    if (environment === 'production') {
      const promotedRollout = await checkPromotedRollout(db, release.id);
      const isOverride = isProductionOverride(req);
      const prodError = validateProductionPromotion(release, promotedRollout, isOverride);
      if (prodError) return res.status(400).json({ error: prodError });
    }
    
    const scope = scopeSql(req);
    const result = await updateReleaseEnvironment(db, { releaseId: release.id, environment, scope });
    if (result.error) return res.status(409).json({ error: result.error });
    res.json(result);
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

function buildDefaultVariants(strategy) {
  return strategy === 'canary' 
    ? [{ name: 'stable', traffic: 95 }, { name: 'canary', traffic: 5 }] 
    : [{ name: 'control', traffic: 50 }, { name: 'candidate', traffic: 50 }];
}

function validateVariants(variants, requiredNumber) {
  if (!Array.isArray(variants) || variants.length < 2 || variants.some((variant) => !variant || typeof variant.name !== 'string' || !variant.name.trim())) {
    return { error: { code: 'INVALID_VARIANTS', message: 'At least two named variants with traffic totaling 100 are required.' } };
  }
  
  const variantNames = variants.map((variant) => variant.name.trim());
  if (new Set(variantNames).size !== variantNames.length) return { error: { code: 'INVALID_VARIANTS', message: 'Variant names must be unique.' } };
  
  let traffic;
  try {
    const validatedVariants = variants.map((variant) => ({ ...variant, name: variant.name.trim(), traffic: requiredNumber(variant.traffic, 'variant traffic', { min: 0, max: 100 }) }));
    traffic = validatedVariants.reduce((total, variant) => total + variant.traffic, 0);
    if (Math.abs(traffic - 100) > 0.001) throw new Error('Variant traffic must total 100.');
    return { variants: validatedVariants };
  } catch (error) {
    return { error: { code: 'INVALID_VARIANTS', message: error.message } };
  }
}

function validateSlo(slo, requiredNumber) {
  if (!slo || typeof slo !== 'object' || Array.isArray(slo)) return { error: { code: 'INVALID_VARIANTS', message: 'slo must be an object.' } };
  try {
    requiredNumber(slo.maxErrorRate, 'maxErrorRate', { min: 0, max: 1 });
    requiredNumber(slo.maxAverageLatencyMs, 'maxAverageLatencyMs', { min: 0, max: 86_400_000 });
    requiredNumber(slo.minRequests, 'minRequests', { integer: true, min: 1, max: 1_000_000_000 });
    return { slo };
  } catch (error) {
    return { error: { code: 'INVALID_VARIANTS', message: error.message } };
  }
}

function validateRolloutConfig({ strategy, body, requiredNumber }) {
  if (!['canary', 'ab'].includes(strategy)) return { error: { code: 'INVALID_ROLLOUT_STRATEGY', message: 'strategy must be canary or ab.' } };
  
  const defaultVariants = buildDefaultVariants(strategy);
  
  const config = {
    variants: body?.variants || defaultVariants,
    slo: body?.slo || { maxErrorRate: 0.01, maxAverageLatencyMs: 3000, minRequests: 100 }
  };

  const variantsValidation = validateVariants(config.variants, requiredNumber);
  if (variantsValidation.error) return variantsValidation;
  config.variants = variantsValidation.variants;

  const sloValidation = validateSlo(config.slo, requiredNumber);
  if (sloValidation.error) return sloValidation;
  config.slo = sloValidation.slo;

  return { config };
}

async function insertRollout(db, { rolloutId, releaseId, scope, strategy, config }) {
  await db.run('INSERT INTO release_rollouts(id,release_id,organization_id,project_id,strategy,config_json) VALUES(?,?,?,?,?,?)', rolloutId, releaseId, ...scope.params, strategy, JSON.stringify(config));
  for (const variant of config.variants) await db.run('INSERT INTO release_rollout_metrics(rollout_id,variant) VALUES(?,?)', rolloutId, variant.name);
}

async function createRollout(req, res, next) {
  try {
    const db = await getDatabase();
    const release = await scopedRelease(db, req, req.params.id);
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    
    const strategy = String(req.body?.strategy || 'canary').toLowerCase();
    const configValidation = validateRolloutConfig({ strategy, config: req.body, requiredNumber });
    if (configValidation.error) return res.status(400).json(configValidation.error);
    
    const rolloutId = id('rollout');
    const scope = scopeSql(req);
    await insertRollout(db, { rolloutId, releaseId: release.id, scope, strategy, config: configValidation.config });
    
    res.status(201).json({ id: rolloutId, releaseId: release.id, strategy, status: 'running', ...configValidation.config });
  } catch (error) { next(error); }
}

function validateMetricInput({ variant, requests, errors, latencyMs, tokens, costUsd, validatedRequests }) {
  if (typeof variant !== 'string' || !variant.trim()) return { error: { code: 'INVALID_VARIANT', message: 'variant must be a non-empty string.' } };
  try {
    return {
      validatedRequests: requiredNumber(requests, 'requests', { integer: true, min: 0, max: 1_000_000_000 }),
      validatedErrors: requiredNumber(errors, 'errors', { integer: true, min: 0, max: validatedRequests }),
      validatedLatency: requiredNumber(latencyMs, 'latencyMs', { min: 0, max: 86_400_000 }),
      validatedTokens: requiredNumber(tokens, 'tokens', { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER }),
      validatedCost: requiredNumber(costUsd, 'costUsd', { min: 0, max: Number.MAX_SAFE_INTEGER })
    };
  } catch (error) {
    return { error: { code: error.code, message: error.message } };
  }
}

async function updateRolloutMetrics(db, { rolloutId, variant, requestCount, errorCount, latencyMs, tokens, costUsd }) {
  await db.run(`UPDATE release_rollout_metrics SET requests = requests + ?, errors = errors + ?, latency_ms_total = latency_ms_total + ?, tokens = tokens + ?, cost_usd = cost_usd + ?, updated_at = CURRENT_TIMESTAMP WHERE rollout_id = ? AND variant = ?`, requestCount, errorCount, latencyMs * requestCount, tokens, costUsd, rolloutId, variant);
}

async function insertUsageLedger(db, { id, scope, releaseId, rolloutId, variant, requestCount, costUsd, tokens }) {
  await db.run('INSERT INTO usage_ledger(id,organization_id,project_id,release_id,category,quantity,cost_usd,metadata_json) VALUES(?,?,?,?,?,?,?,?)', id, ...scope.params, releaseId, 'rollout', requestCount, costUsd, JSON.stringify({ rolloutId, variant, tokens }));
}

async function resumeRolloutIfNeeded(db, { rollout, requestCount }) {
  if (rollout.status === 'paused' && requestCount > 0) {
    await db.run("UPDATE release_rollouts SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?", rollout.id);
  }
}

async function recordRolloutMetric(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rollout = await db.get(`SELECT * FROM release_rollouts WHERE id = ? AND ${scope.clause}`, req.params.rolloutId, ...scope.params);
    if (!rollout) return res.status(404).json({ error: { code: 'ROLLOUT_NOT_FOUND', message: 'Rollout is outside the tenant scope.' } });
    if (rollout.status !== 'running' && rollout.status !== 'paused') return res.status(409).json({ error: { code: 'ROLLOUT_CLOSED', message: 'Metrics can only be recorded on a running or paused rollout.' } });
    
    const { variant, requests = 0, errors = 0, latencyMs = 0, tokens = 0, costUsd = 0 } = req.body || {};
    const validation = validateMetricInput({ variant, requests, errors, latencyMs, tokens, costUsd });
    if (validation.error) return res.status(400).json(validation.error);
    
    const { validatedRequests, validatedErrors, validatedLatency, validatedTokens, validatedCost } = validation;
    const metric = await db.get('SELECT variant FROM release_rollout_metrics WHERE rollout_id = ? AND variant = ?', rollout.id, variant);
    if (!metric) return res.status(400).json({ error: { code: 'UNKNOWN_VARIANT', message: 'variant is not configured for this rollout.' } });
    
    const requestCount = validatedRequests;
    await updateRolloutMetrics(db, { rolloutId: rollout.id, variant, requestCount, errorCount: validatedErrors, latencyMs: validatedLatency, tokens: validatedTokens, costUsd: validatedCost });
    await insertUsageLedger(db, { id: id('usage'), scope, releaseId: rollout.release_id, rolloutId: rollout.id, variant, requestCount, costUsd: validatedCost, tokens: validatedTokens });
    await resumeRolloutIfNeeded(db, { rollout, requestCount });
    
    res.status(202).json({ rolloutId: rollout.id, variant, accepted: true });
  } catch (error) { next(error); }
}

function getCandidateVariantName(config, strategy) {
  return (config.variants && config.variants.length > 1) 
    ? config.variants[config.variants.length - 1].name 
    : (strategy === 'canary' ? 'canary' : 'candidate');
}

function getCandidateMetric(metrics, candidateVariantName) {
  return metrics.find(m => m.variant === candidateVariantName) || { requests: 0, errors: 0, latency_ms_total: 0 };
}

function calculateCandidateMetrics(candidateMetric) {
  const candidateRequests = candidateMetric.requests;
  const errorRate = candidateRequests ? candidateMetric.errors / candidateRequests : 0;
  const averageLatencyMs = candidateRequests ? candidateMetric.latency_ms_total / candidateRequests : 0;
  return { candidateRequests, errorRate, averageLatencyMs };
}

function checkSampleSize(totalRequests, policy) {
  const minRequests = Math.max(1, number(policy.minRequests, 100));
  return totalRequests < minRequests ? { status: 'paused', reason: 'insufficient_sample', totalRequests } : null;
}

function checkSloBreach({ errorRate, averageLatencyMs, policy, totalRequests }) {
  if (errorRate > number(policy.maxErrorRate, 0.01) || averageLatencyMs > number(policy.maxAverageLatencyMs, 3000)) {
    return { status: 'rolled_back', reason: 'slo_breach', totalRequests, errorRate, averageLatencyMs, latencyMetric: 'average' };
  }
  return null;
}

function findWinner(metrics) {
  return [...metrics].sort((left, right) => 
    (left.errors / Math.max(1, left.requests)) - (right.errors / Math.max(1, right.requests)) || 
    (left.latency_ms_total / Math.max(1, left.requests)) - (right.latency_ms_total / Math.max(1, right.requests))
  )[0]?.variant;
}

function checkCanaryUnderperformance(strategy, winner) {
  if (strategy === 'canary' && winner === 'stable') {
    return { status: 'rolled_back', reason: 'candidate_underperformed' };
  }
  return null;
}

function decide(metrics, config, strategy = 'canary') {
  const policy = config.slo || {};
  const totalRequests = metrics.reduce((sum, metric) => sum + metric.requests, 0);
  
  const candidateVariantName = getCandidateVariantName(config, strategy);
  const candidateMetric = getCandidateMetric(metrics, candidateVariantName);
  const { candidateRequests, errorRate, averageLatencyMs } = calculateCandidateMetrics(candidateMetric);
  
  const sampleCheck = checkSampleSize(totalRequests, policy);
  if (sampleCheck) return { ...sampleCheck, errorRate, averageLatencyMs };
  
  const sloBreach = checkSloBreach({ errorRate, averageLatencyMs, policy, totalRequests });
  if (sloBreach) return sloBreach;
  
  const winner = findWinner(metrics);
  const canaryCheck = checkCanaryUnderperformance(strategy, winner);
  if (canaryCheck) return { ...canaryCheck, selectedVariant: winner, totalRequests, errorRate, averageLatencyMs, latencyMetric: 'average' };
  
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
    await withTransaction(db, async (tx) => {
      const rolloutUpdate = await tx.run(`UPDATE release_rollouts SET status = ?, decision_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, outcome.status, JSON.stringify(outcome), rollout.id, ...scope.params);
      if (rolloutUpdate.changes !== 1) throw Object.assign(new Error('Rollout changed before its decision could be persisted.'), { code: 'ROLLOUT_STATE_CHANGED' });
      if (outcome.status === 'promoted' || outcome.status === 'rolled_back') {
        const releaseStatus = outcome.status === 'promoted' ? 'active' : 'rolled_back';
        const releaseUpdate = await tx.run(`UPDATE releases SET status = ?${outcome.status === 'promoted' ? ", environment = 'production'" : ''}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, releaseStatus, rollout.release_id, ...scope.params);
        if (releaseUpdate.changes !== 1) throw Object.assign(new Error('Release changed before its rollout decision could be applied.'), { code: 'RELEASE_STATE_CHANGED' });
      }
    });
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

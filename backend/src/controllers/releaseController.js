const crypto = require('crypto');
const { getDatabase, withTransaction } = require('../db');
const { scopeSql } = require('../middleware/tenant');
const releasePromotionAuthority = require('../services/releasePromotionAuthority');

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

function validateProductionPromotion(release, promotedRollout, override) {
  if (['draft', 'pending', 'failed', 'rolled_back'].includes(release.status)) {
    return { code: 'INVALID_RELEASE_STATUS', message: `Cannot promote release in status ${release.status} to production.` };
  }
  if (!promotedRollout && !override) {
    return { code: 'ROLLOUT_REQUIRED', message: 'Promotion to production requires a successful rollout or an explicit force override with overrideReason.' };
  }
  return null;
}

async function validatePromotionRequest(db, req, release) {
  const activeRollout = await checkActiveRollout(db, release.id);
  if (activeRollout) return { status: 409, error: { code: 'ROLLOUT_IN_PROGRESS', message: 'Decide the active rollout before promotion.' } };
  const environment = req.body?.environment || 'production';
  const environmentError = validateEnvironment(environment);
  if (environmentError) return { status: 400, error: environmentError };
  const overrideError = releasePromotionAuthority.validateForceOverride(req, environment);
  if (overrideError) return { status: 400, error: overrideError };
  if (environment !== 'production') return { environment };
  const promotedRollout = await checkPromotedRollout(db, release.id);
  const promotionError = validateProductionPromotion(release, promotedRollout, releasePromotionAuthority.isProductionOverride(req));
  return promotionError ? { status: 400, error: promotionError } : { environment };
}

async function promote(req, res, next) {
  try {
    const db = await getDatabase();
    const release = await scopedRelease(db, req, req.params.id);
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    const validation = await validatePromotionRequest(db, req, release);
    if (validation.error) return res.status(validation.status).json({ error: validation.error });
    const scope = scopeSql(req);
    const override = releasePromotionAuthority.isProductionOverride(req)
      ? releasePromotionAuthority.buildForceOverrideReceipt(req, release.id, scope) : null;
    const result = await releasePromotionAuthority.updateReleaseEnvironment(db, { releaseId: release.id, environment: validation.environment, scope, override });
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

function resolveCandidateVariant(variants, strategy, requestedCandidate) {
  const conventionalName = strategy === 'ab' ? 'candidate' : 'canary';
  const inferredName = variants.find((variant) => variant.name === conventionalName)?.name;
  const candidateVariant = requestedCandidate || inferredName;
  return candidateVariant && variants.some((variant) => variant.name === candidateVariant)
    ? { candidateVariant }
    : { error: { code: 'INVALID_CANDIDATE_VARIANT', message: 'candidateVariant must match a configured variant when no conventional candidate name is present.' } };
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

  const candidateValidation = resolveCandidateVariant(config.variants, strategy, body?.candidateVariant);
  if (candidateValidation.error) return candidateValidation;
  config.candidateVariant = candidateValidation.candidateVariant;

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
    const strategy = String(req.body?.strategy || 'canary').toLowerCase();
    const configValidation = validateRolloutConfig({ strategy, body: req.body, requiredNumber });
    if (configValidation.error) return res.status(400).json(configValidation.error);
    
    const rolloutId = id('rollout');
    const scope = scopeSql(req);
    const release = await withTransaction(db, async (tx) => {
      const scoped = await scopedRelease(tx, req, req.params.id);
      if (!scoped) return null;
      await insertRollout(tx, { rolloutId, releaseId: scoped.id, scope, strategy, config: configValidation.config });
      return scoped;
    });
    if (!release) return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: 'Release is outside the tenant scope.' } });
    
    res.status(201).json({ id: rolloutId, releaseId: release.id, strategy, status: 'running', ...configValidation.config });
  } catch (error) { next(error); }
}

function validateMetricInput({ variant, requests, errors, latencyMs, tokens, costUsd }) {
  if (typeof variant !== 'string' || !variant.trim()) return { error: { code: 'INVALID_VARIANT', message: 'variant must be a non-empty string.' } };
  try {
    const requestCount = requiredNumber(requests, 'requests', { integer: true, min: 0, max: 1_000_000_000 });
    return {
      validatedRequests: requestCount,
      validatedErrors: requiredNumber(errors, 'errors', { integer: true, min: 0, max: requestCount }),
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

async function persistRolloutMetric(db, request) {
  return withTransaction(db, async (tx) => {
    const rollout = await tx.get(`SELECT * FROM release_rollouts WHERE id = ? AND ${request.scope.clause}`,
      request.rolloutId, ...request.scope.params);
    if (!rollout) return { status: 404, error: { code: 'ROLLOUT_NOT_FOUND', message: 'Rollout is outside the tenant scope.' } };
    if (!['running', 'paused'].includes(rollout.status)) {
      return { status: 409, error: { code: 'ROLLOUT_CLOSED', message: 'Metrics can only be recorded on a running or paused rollout.' } };
    }
    const metric = await tx.get('SELECT variant FROM release_rollout_metrics WHERE rollout_id = ? AND variant = ?', rollout.id, request.variant);
    if (!metric) return { status: 400, error: { code: 'UNKNOWN_VARIANT', message: 'variant is not configured for this rollout.' } };
    await updateRolloutMetrics(tx, { rolloutId: rollout.id, variant: request.variant, requestCount: request.validatedRequests,
      errorCount: request.validatedErrors, latencyMs: request.validatedLatency, tokens: request.validatedTokens, costUsd: request.validatedCost });
    await insertUsageLedger(tx, { id: id('usage'), scope: request.scope, releaseId: rollout.release_id,
      rolloutId: rollout.id, variant: request.variant, requestCount: request.validatedRequests,
      costUsd: request.validatedCost, tokens: request.validatedTokens });
    await resumeRolloutIfNeeded(tx, { rollout, requestCount: request.validatedRequests });
    return { status: 202, body: { rolloutId: rollout.id, variant: request.variant, accepted: true } };
  });
}

async function recordRolloutMetric(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const { variant, requests = 0, errors = 0, latencyMs = 0, tokens = 0, costUsd = 0 } = req.body || {};
    const validation = validateMetricInput({ variant, requests, errors, latencyMs, tokens, costUsd });
    if (validation.error) return res.status(400).json(validation.error);
    const result = await persistRolloutMetric(db, { rolloutId: req.params.rolloutId, scope, variant, ...validation });
    if (result.error) return res.status(result.status).json(result.error);
    res.status(result.status).json(result.body);
  } catch (error) { next(error); }
}

function getCandidateVariantName(config, strategy) {
  const conventionalName = strategy === 'canary' ? 'canary' : 'candidate';
  if (config.candidateVariant) return config.candidateVariant;
  if (!config.variants) return conventionalName;
  return config.variants.find((variant) => variant.name === conventionalName)?.name || null;
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

function checkSampleSize(candidateRequests, policy) {
  const minRequests = Math.max(1, number(policy.minRequests, 100));
  return candidateRequests < minRequests ? { status: 'paused', reason: 'insufficient_sample', candidateRequests } : null;
}

function checkSloBreach({ errorRate, averageLatencyMs, policy, totalRequests }) {
  if (errorRate > number(policy.maxErrorRate, 0.01) || averageLatencyMs > number(policy.maxAverageLatencyMs, 3000)) {
    return { status: 'rolled_back', reason: 'slo_breach', totalRequests, errorRate, averageLatencyMs, latencyMetric: 'average' };
  }
  return null;
}

function findWinner(metrics, minimumRequests) {
  const comparableMetrics = metrics.filter((metric) => metric.requests >= minimumRequests);
  if (comparableMetrics.length !== metrics.length) return null;
  if (!comparableMetrics.length) return null;
  return [...comparableMetrics].sort((left, right) =>
    (left.errors / Math.max(1, left.requests)) - (right.errors / Math.max(1, right.requests)) ||
    (left.latency_ms_total / Math.max(1, left.requests)) - (right.latency_ms_total / Math.max(1, right.requests))
  )[0]?.variant;
}

function checkCandidateUnderperformance(winner, candidateVariantName) {
  if (winner !== candidateVariantName) return { status: 'rolled_back', reason: 'candidate_underperformed', selectedVariant: winner };
  return null;
}

function decide(metrics, config, strategy = 'canary') {
  const policy = config.slo || {};
  const totalRequests = metrics.reduce((sum, metric) => sum + metric.requests, 0);
  
  const candidateVariantName = getCandidateVariantName(config, strategy);
  if (!candidateVariantName) return { status: 'paused', reason: 'candidate_identity_missing', totalRequests, candidateVariant: null };
  const candidateMetric = getCandidateMetric(metrics, candidateVariantName);
  const { candidateRequests, errorRate, averageLatencyMs } = calculateCandidateMetrics(candidateMetric);
  
  const sampleCheck = checkSampleSize(candidateRequests, policy);
  if (sampleCheck) return { ...sampleCheck, totalRequests, errorRate, averageLatencyMs, candidateVariant: candidateVariantName };
  
  const sloBreach = checkSloBreach({ errorRate, averageLatencyMs, policy, totalRequests });
  if (sloBreach) return { ...sloBreach, candidateVariant: candidateVariantName };
  
  const minimumRequests = Math.max(1, number(policy.minRequests, 100));
  const winner = findWinner(metrics, minimumRequests);
  if (!winner) return { status: 'paused', reason: 'insufficient_comparison_sample', totalRequests,
    errorRate, averageLatencyMs, candidateVariant: candidateVariantName };
  const candidateCheck = checkCandidateUnderperformance(winner, candidateVariantName);
  if (candidateCheck) return { ...candidateCheck, totalRequests, errorRate, averageLatencyMs,
    latencyMetric: 'average', candidateVariant: candidateVariantName };
  
  return { status: 'promoted', reason: 'slo_satisfied', selectedVariant: winner, totalRequests, errorRate,
    averageLatencyMs, latencyMetric: 'average', candidateVariant: candidateVariantName };
}

async function decideRollout(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const result = await withTransaction(db, async (tx) => {
      const rollout = await tx.get(`SELECT * FROM release_rollouts WHERE id = ? AND ${scope.clause}`, req.params.rolloutId, ...scope.params);
      if (!rollout) return { status: 404, error: { code: 'ROLLOUT_NOT_FOUND', message: 'Rollout is outside the tenant scope.' } };
      if (!['running', 'paused'].includes(rollout.status)) return { status: 409, error: { code: 'ROLLOUT_CLOSED', message: 'Rollout already has a terminal decision.' } };
      const metrics = await tx.all('SELECT * FROM release_rollout_metrics WHERE rollout_id = ? ORDER BY variant', rollout.id);
      const outcome = decide(metrics, JSON.parse(rollout.config_json), rollout.strategy);
      const rolloutUpdate = await tx.run(`UPDATE release_rollouts SET status = ?, decision_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, outcome.status, JSON.stringify(outcome), rollout.id, ...scope.params);
      if (rolloutUpdate.changes !== 1) throw Object.assign(new Error('Rollout changed before its decision could be persisted.'), { code: 'ROLLOUT_STATE_CHANGED' });
      if (outcome.status === 'promoted' || outcome.status === 'rolled_back') {
        const releaseStatus = outcome.status === 'promoted' ? 'active' : 'rolled_back';
        const releaseUpdate = await tx.run(`UPDATE releases SET status = ?${outcome.status === 'promoted' ? ", environment = 'production'" : ''}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${scope.clause}`, releaseStatus, rollout.release_id, ...scope.params);
        if (releaseUpdate.changes !== 1) throw Object.assign(new Error('Release changed before its rollout decision could be applied.'), { code: 'RELEASE_STATE_CHANGED' });
      }
      return { status: 200, body: { id: rollout.id, strategy: rollout.strategy, metrics, ...outcome } };
    });
    if (result.error) return res.status(result.status).json(result.error);
    res.json(result.body);
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

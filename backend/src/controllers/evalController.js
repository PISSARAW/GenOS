const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');

const parse = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
const KNOWN_GRADERS = new Set(['exact_match', 'groundedness', 'safety', 'llm_judge']);

function camelKey(key) { return String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()); }

function mapEvaluationRow(row = {}) {
  const mapped = Object.fromEntries(Object.entries(row).map(([key, value]) => [camelKey(key), value]));
  if (Object.prototype.hasOwnProperty.call(row, 'metadata_json')) mapped.metadata = parse(row.metadata_json, {});
  if (Object.prototype.hasOwnProperty.call(row, 'config_json')) mapped.config = parse(row.config_json, {});
  if (Object.prototype.hasOwnProperty.call(row, 'result_json')) mapped.result = parse(row.result_json, null);
  if (Object.prototype.hasOwnProperty.call(row, 'error_json')) mapped.error = parse(row.error_json, null);
  delete mapped.metadataJson;
  delete mapped.configJson;
  delete mapped.resultJson;
  delete mapped.errorJson;
  return mapped;
}

async function listDatasets(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rows = await db.all(`SELECT * FROM datasets WHERE ${scope.clause} ORDER BY updated_at DESC`, ...scope.params);
    res.json(rows.map(mapEvaluationRow));
  } catch (error) { next(error); }
}

async function createCampaign(req, res, next) {
  try {
    const db = await getDatabase();
    const { name, seed = null, config = {} } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Campaign name is required.' } });
    const id = `campaign-${crypto.randomUUID()}`;
    const scope = scopeSql(req);
    await db.run('INSERT INTO evaluation_campaigns(id,name,status,seed,config_json,organization_id,project_id) VALUES(?,?,?,?,?,?,?)', id, String(name).trim(), 'planned', seed, JSON.stringify(config), ...scope.params);
    res.status(201).json({ id, name: String(name).trim(), status: 'planned', seed, config });
  } catch (error) { next(error); }
}

async function listCampaigns(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rows = await db.all(`SELECT * FROM evaluation_campaigns WHERE ${scope.clause} ORDER BY created_at DESC`, ...scope.params);
    res.json(rows.map(mapEvaluationRow));
  } catch (error) { next(error); }
}

async function createDataset(req, res, next) {
  try {
    const db = await getDatabase();
    const { name, description = '' } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Dataset name is required.' } });
    const id = `ds-${crypto.randomUUID()}`;
    const scope = scopeSql(req);
    await db.run('INSERT INTO datasets(id,name,description,organization_id,project_id) VALUES(?,?,?,?,?)', id, String(name).trim(), description, ...scope.params);
    res.status(201).json(mapEvaluationRow(await db.get('SELECT * FROM datasets WHERE id=?', id)));
  } catch (error) { next(error); }
}

async function addCase(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const dataset = await db.get(`SELECT id FROM datasets WHERE id=? AND ${scope.clause}`, req.params.id, ...scope.params);
    if (!dataset) return res.status(404).json({ error: { code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' } });
    const id = `case-${crypto.randomUUID()}`;
    const { input = {}, expected = null, labels = [] } = req.body || {};
    if (!Array.isArray(labels)) return res.status(400).json({ error: { code: 'INVALID_LABELS', message: 'labels must be an array.' } });
    await db.run('INSERT INTO dataset_cases(id,dataset_id,input_json,expected_json,labels_json) VALUES(?,?,?,?,?)', id, req.params.id, JSON.stringify(input), JSON.stringify(expected), JSON.stringify(labels));
    res.status(201).json({ id, datasetId: req.params.id, input, expected, labels });
  } catch (error) { next(error); }
}

async function listCases(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rows = await db.all('SELECT c.* FROM dataset_cases c JOIN datasets d ON d.id=c.dataset_id WHERE c.dataset_id=? AND d.organization_id=? AND d.project_id=? ORDER BY c.created_at', req.params.id, ...scope.params);
    res.json(rows.map((row) => ({ ...row, input: parse(row.input_json, {}), expected: parse(row.expected_json, null), labels: parse(row.labels_json, []) })));
  } catch (error) { next(error); }
}

function validateGraders({ graders, judgeModel }) {
  if (!Array.isArray(graders) || graders.length === 0 || graders.some((grader) => !KNOWN_GRADERS.has(grader))) {
    return { error: { code: 'INVALID_GRADERS', message: 'Unsupported evaluation grader.' } };
  }
  if (graders.includes('llm_judge') && !judgeModel) {
    return { error: { code: 'JUDGE_MODEL_REQUIRED', message: 'llm_judge requires judgeModel or GENOS_DEFAULT_MODEL.' } };
  }
  return null;
}

async function validateExactMatch(db, datasetId) {
  return db.get("SELECT id FROM dataset_cases WHERE dataset_id=? AND (expected_json IS NULL OR expected_json = 'null') LIMIT 1", datasetId);
}

function extractJobConfig(body) {
  return body?.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : {};
}

function extractJobIds(body) {
  return {
    datasetId: String(body?.datasetId || '').trim(),
    campaignId: body?.campaignId ? String(body.campaignId).trim() : null
  };
}

async function validateDatasetAndCampaign({ db, scope, datasetId, campaignId }) {
  if (!datasetId) return { error: { code: 'DATASET_REQUIRED', message: 'datasetId is required.' } };
  const dataset = await db.get(`SELECT id FROM datasets WHERE id=? AND ${scope.clause}`, datasetId, ...scope.params);
  if (!dataset) return { error: { code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' } };
  if (campaignId && !await db.get(`SELECT id FROM evaluation_campaigns WHERE id=? AND ${scope.clause}`, campaignId, ...scope.params)) {
    return { error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.' } };
  }
  const cases = await db.get('SELECT COUNT(*) AS count FROM dataset_cases WHERE dataset_id=?', datasetId);
  if (!cases?.count) return { error: { code: 'EMPTY_DATASET', message: 'Add at least one case before creating an evaluation job.' } };
  return { dataset };
}

async function validateGradersForJob({ db, datasetId, graders, judgeModel }) {
  const graderError = validateGraders({ graders, judgeModel });
  if (graderError) return graderError;
  if (graders.includes('exact_match') && await validateExactMatch(db, datasetId)) {
    return { error: { code: 'EXPECTED_REQUIRED', message: 'exact_match grader requires expected output for all cases.' } };
  }
  return null;
}

async function createJobRecord({ db, scope, id, campaignId, datasetId, config }) {
  await db.run('INSERT INTO evaluation_jobs(id,campaign_id,dataset_id,config_json,status,organization_id,project_id) VALUES(?,?,?,?,?,?,?)', id, campaignId, datasetId, JSON.stringify(config), 'queued', ...scope.params);
}

async function createJob(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const { datasetId, campaignId } = extractJobIds(req.body);
    const validation = await validateDatasetAndCampaign({ db, scope, datasetId, campaignId });
    if (validation.error) return res.status(400).json(validation.error);
    const config = extractJobConfig(req.body);
    const graders = config.graders || ['exact_match'];
    const judgeModel = config.judgeModel || process.env.GENOS_DEFAULT_MODEL || '';
    const graderError = await validateGradersForJob({ db, datasetId, graders, judgeModel });
    if (graderError) return res.status(400).json(graderError);
    const id = `job-${crypto.randomUUID()}`;
    await createJobRecord({ db, scope, id, campaignId, datasetId, config });
    res.status(201).json({ id, campaignId, datasetId, config, status: 'queued' });
  } catch (error) { next(error); }
}

async function listJobs(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req, 'j');
    const rows = await db.all(`SELECT j.* FROM evaluation_jobs j WHERE ${scope.clause} ORDER BY j.created_at DESC`, ...scope.params);
    res.json(rows.map(mapEvaluationRow));
  } catch (error) { next(error); }
}

async function cancelJob(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const result = await db.run(
      `UPDATE evaluation_jobs SET status = 'cancelled', error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL
       WHERE id = ? AND ${scope.clause} AND status IN ('queued', 'running')`,
      JSON.stringify({ message: 'Evaluation job cancelled by operator.', cancelled: true }), req.params.id, ...scope.params
    );
    if (result.changes !== 1) return res.status(409).json({ error: { code: 'JOB_NOT_CANCELLABLE', message: 'Job does not exist or is already terminal.' } });
    res.json({ id: req.params.id, status: 'cancelled' });
  } catch (error) { next(error); }
}

async function getJob(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req, 'j');
    const row = await db.get(`SELECT j.* FROM evaluation_jobs j WHERE j.id = ? AND ${scope.clause}`, req.params.id, ...scope.params);
    if (!row) return res.status(404).json({ error: { code: 'EVALUATION_JOB_NOT_FOUND', message: 'Evaluation job not found.' } });
    res.json({ ...row, config: parse(row.config_json, {}), result: parse(row.result_json, null), error: parse(row.error_json, null) });
  } catch (error) { next(error); }
}

module.exports = { listDatasets, createDataset, addCase, listCases, createCampaign, listCampaigns, createJob, listJobs, cancelJob, getJob, mapEvaluationRow };
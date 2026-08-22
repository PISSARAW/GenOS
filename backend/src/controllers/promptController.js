const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');

const parse = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
const row = (item) => item && ({ ...item, variables: parse(item.variables_json, []), config: parse(item.config_json, {}) });

async function listPrompts(req, res, next) {
  try { const db = await getDatabase(); const s = scopeSql(req); const prompts = await db.all(`SELECT * FROM prompts WHERE ${s.clause} ORDER BY updated_at DESC`, ...s.params); res.json(prompts.map(row)); } catch (e) { next(e); }
}
async function createPrompt(req, res, next) {
  try {
    const db = await getDatabase(); const { name, template = '', variables = [], model = 'fake://local' } = req.body || {};
    if (!name) return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Prompt name is required.' } });
    const id = `prompt-${crypto.randomUUID()}`; const versionId = `pv-${crypto.randomUUID()}`; const s = scopeSql(req);
    await db.run('INSERT INTO prompts (id, name, current_version, variables_json, organization_id, project_id) VALUES (?, ?, 1, ?, ?, ?)', id, name, JSON.stringify(variables), ...s.params);
    await db.run('INSERT INTO prompt_versions (id, prompt_id, version, template, model, config_json) VALUES (?, ?, 1, ?, ?, ?)', versionId, id, template, model, JSON.stringify({}));
    res.status(201).json({ id, name, version: 1, template, model, variables });
  } catch (e) { next(e); }
}
async function getPrompt(req, res, next) {
  try { const db = await getDatabase(); const s = scopeSql(req); const prompt = await db.get(`SELECT * FROM prompts WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params); if (!prompt) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }); const versions = await db.all('SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC', req.params.id); res.json({ ...row(prompt), versions }); } catch (e) { next(e); }
}
async function createVersion(req, res, next) {
  try {
    const db = await getDatabase(); const s = scopeSql(req);
    const prompt = await db.get(`SELECT * FROM prompts WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params);
    if (!prompt) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } });
    const version = Number(prompt.current_version) + 1; const id = `pv-${crypto.randomUUID()}`;
    const { template = '', model = 'fake://local', config = {} } = req.body || {};
    await db.run('INSERT INTO prompt_versions (id, prompt_id, version, template, model, config_json) VALUES (?, ?, ?, ?, ?, ?)', id, prompt.id, version, template, model, JSON.stringify(config));
    await db.run('UPDATE prompts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', version, prompt.id);
    res.status(201).json({ id, promptId: prompt.id, version, template, model, config });
  } catch (e) { next(e); }
}
async function renderPrompt(req, res, next) {
  try { const db = await getDatabase(); const s = scopeSql(req); const version = await db.get(`SELECT v.* FROM prompt_versions v JOIN prompts p ON p.id=v.prompt_id WHERE v.prompt_id = ? AND v.version = ? AND p.organization_id=? AND p.project_id=?`, req.params.id, Number(req.body?.version || 1), ...s.params); if (!version) return res.status(404).json({ error: { code: 'VERSION_NOT_FOUND', message: 'Prompt version not found.' } }); const variables = req.body?.variables || {}; const rendered = version.template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => key.split('.').reduce((value, part) => value == null ? '' : value[part], variables) ?? ''); res.json({ promptId: req.params.id, version: version.version, rendered, model: version.model }); } catch (e) { next(e); }
}
async function playground(req, res, next) {
  try { const { prompt = '', models = [], variables = {}, config = {} } = req.body || {}; const rendered = prompt.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => key.split('.').reduce((value, part) => value == null ? '' : value[part], variables) ?? ''); const db = await getDatabase(); const id = `model-${crypto.randomUUID()}`; const s = scopeSql(req); await db.run('INSERT INTO model_jobs(id,prompt,models_json,config_json,max_attempts,timeout_ms,organization_id,project_id) VALUES(?,?,?,?,?,?,?,?)', id, rendered, JSON.stringify(models.length ? models : ['fake://local']), JSON.stringify(config), Number(config.maxAttempts || 3), Number(config.timeoutMs || 30000), ...s.params); res.status(202).json({ id, status: 'queued', models: models.length ? models : ['fake://local'], rendered }); } catch (e) { next(e); }
}
async function listJobs(req, res, next) { try { const db = await getDatabase(); const s = scopeSql(req); const jobs = await db.all(`SELECT * FROM model_jobs WHERE ${s.clause} ORDER BY created_at DESC LIMIT 100`, ...s.params); res.json(jobs.map((job) => ({ ...job, models: parse(job.models_json, []), config: parse(job.config_json, {}), result: parse(job.result_json, null), error: parse(job.error_json, null) }))); } catch (e) { next(e); } }
async function streamJob(req, res, next) {
  try { const db = await getDatabase(); const s = scopeSql(req); const job = await db.get(`SELECT id FROM model_jobs WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params); if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Model job not found.' } }); res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); let lastId = 0; const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); const poll = async () => { const tokens = await db.all('SELECT * FROM model_job_tokens WHERE job_id = ? AND id > ? ORDER BY id', req.params.id, lastId); for (const token of tokens) { lastId = token.id; send('token', token); } const current = await db.get(`SELECT status, result_json, error_json FROM model_jobs WHERE id = ? AND ${s.clause}`, req.params.id, ...s.params); send('status', current); if (current.status === 'completed' || current.status === 'failed') { send('done', current); clearInterval(timer); res.end(); } }; const timer = setInterval(() => poll().catch(() => {}), 250); req.on('close', () => clearInterval(timer)); await poll(); } catch (e) { next(e); }
}
module.exports = { listPrompts, createPrompt, getPrompt, createVersion, renderPrompt, playground, listJobs, streamJob };

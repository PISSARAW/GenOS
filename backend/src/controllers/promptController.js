const crypto = require('crypto');
const { getDatabase } = require('../db');

const parse = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
const row = (item) => item && ({ ...item, variables: parse(item.variables_json, []), config: parse(item.config_json, {}) });

async function listPrompts(req, res, next) {
  try { const db = await getDatabase(); const prompts = await db.all('SELECT * FROM prompts ORDER BY updated_at DESC'); res.json(prompts.map(row)); } catch (e) { next(e); }
}
async function createPrompt(req, res, next) {
  try {
    const db = await getDatabase(); const { name, template = '', variables = [], model = 'fake://local' } = req.body || {};
    if (!name) return res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Prompt name is required.' } });
    const id = `prompt-${crypto.randomUUID()}`; const versionId = `pv-${crypto.randomUUID()}`;
    await db.run('INSERT INTO prompts (id, name, current_version, variables_json) VALUES (?, ?, 1, ?)', id, name, JSON.stringify(variables));
    await db.run('INSERT INTO prompt_versions (id, prompt_id, version, template, model, config_json) VALUES (?, ?, 1, ?, ?, ?)', versionId, id, template, model, JSON.stringify({}));
    res.status(201).json({ id, name, version: 1, template, model, variables });
  } catch (e) { next(e); }
}
async function getPrompt(req, res, next) {
  try { const db = await getDatabase(); const prompt = await db.get('SELECT * FROM prompts WHERE id = ?', req.params.id); if (!prompt) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }); const versions = await db.all('SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC', req.params.id); res.json({ ...row(prompt), versions }); } catch (e) { next(e); }
}
async function createVersion(req, res, next) {
  try { const db = await getDatabase(); const prompt = await db.get('SELECT * FROM prompts WHERE id = ?', req.params.id); if (!prompt) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }); const version = Number(prompt.current_version) + 1; const id = `pv-${crypto.randomUUID()}`; const { template = '', model = 'fake://local', config = {} } = req.body || {}; await db.run('INSERT INTO prompt_versions (id, prompt_id, version, template, model, config_json) VALUES (?, ?, ?, ?, ?, ?)', id, prompt.id, version, template, model, JSON.stringify(config)); await db.run('UPDATE prompts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', version, prompt.id); res.status(201).json({ id, promptId: prompt.id, version, template, model, config }); } catch (e) { next(e); }
}
async function renderPrompt(req, res, next) {
  try { const db = await getDatabase(); const version = await db.get('SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?', req.params.id, Number(req.body?.version || 1)); if (!version) return res.status(404).json({ error: { code: 'VERSION_NOT_FOUND', message: 'Prompt version not found.' } }); const variables = req.body?.variables || {}; const rendered = version.template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => key.split('.').reduce((value, part) => value == null ? '' : value[part], variables) ?? ''); res.json({ promptId: req.params.id, version: version.version, rendered, model: version.model }); } catch (e) { next(e); }
}
async function playground(req, res, next) {
  try { const { prompt = '', models = [], variables = {}, config = {} } = req.body || {}; const rendered = prompt.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => key.split('.').reduce((value, part) => value == null ? '' : value[part], variables) ?? ''); const db = await getDatabase(); const id = `model-${crypto.randomUUID()}`; await db.run('INSERT INTO model_jobs(id,prompt,models_json,config_json,max_attempts,timeout_ms) VALUES(?,?,?,?,?,?)', id, rendered, JSON.stringify(models.length ? models : ['fake://local']), JSON.stringify(config), Number(config.maxAttempts || 3), Number(config.timeoutMs || 30000)); res.status(202).json({ id, status: 'queued', models: models.length ? models : ['fake://local'], rendered }); } catch (e) { next(e); }
}
async function listJobs(req, res, next) { try { const db = await getDatabase(); const jobs = await db.all('SELECT * FROM model_jobs ORDER BY created_at DESC LIMIT 100'); res.json(jobs.map((job) => ({ ...job, models: parse(job.models_json, []), config: parse(job.config_json, {}), result: parse(job.result_json, null), error: parse(job.error_json, null) }))); } catch (e) { next(e); } }
module.exports = { listPrompts, createPrompt, getPrompt, createVersion, renderPrompt, playground, listJobs };

'use strict';
const { createHash, randomUUID } = require('crypto');
const { withTransaction } = require('../db');

async function table(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS evaluation_job_inputs (
    job_id TEXT PRIMARY KEY, inputs_hash TEXT NOT NULL, cases_json TEXT NOT NULL,
    config_json TEXT NOT NULL, source_job_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
}

function hash(cases) {
  return createHash('sha256').update(JSON.stringify(cases)).digest('hex');
}

async function capture(db, job) {
  await table(db);
  const cases = await db.all('SELECT id,input_json,expected_json,labels_json FROM dataset_cases WHERE dataset_id=? ORDER BY id', job.datasetId);
  await db.run('INSERT INTO evaluation_job_inputs (job_id,inputs_hash,cases_json,config_json) VALUES (?,?,?,?)',
    job.id, hash(cases), JSON.stringify(cases), JSON.stringify(job.config));
}

async function load(db, jobId) {
  await table(db);
  const record = await db.get('SELECT * FROM evaluation_job_inputs WHERE job_id=?', jobId);
  if (!record) return null;
  const cases = JSON.parse(record.cases_json);
  if (hash(cases) !== record.inputs_hash) throw Object.assign(new Error('Empreinte des entrées invalide.'), { code: 'EVALUATION_INPUTS_INVALID', status: 409 });
  return { ...record, cases };
}

async function scopedJob(db, options) {
  const row = await db.get('SELECT * FROM evaluation_jobs WHERE id=? AND organization_id=? AND project_id=?',
    options.id, options.organizationId, options.projectId);
  if (!row) throw Object.assign(new Error('Job introuvable dans ce projet.'), { code: 'EVALUATION_JOB_NOT_FOUND', status: 404 });
  return row;
}

async function replay(db, options) {
  const source = await scopedJob(db, options);
  const snapshot = await load(db, source.id);
  if (!snapshot) throw Object.assign(new Error('Ce job historique ne possède pas d’entrées figées ; rejeu non garanti.'), { code: 'EVALUATION_INPUTS_UNCAPTURED', status: 409 });
  const id = 'job-' + randomUUID();
  await withTransaction(db, async tx => {
    await tx.run('INSERT INTO evaluation_jobs (id,campaign_id,dataset_id,config_json,status,organization_id,project_id) VALUES (?,?,?,?,?,?,?)',
      id, source.campaign_id, source.dataset_id, snapshot.config_json, 'queued', options.organizationId, options.projectId);
    await tx.run('INSERT INTO evaluation_job_inputs (job_id,inputs_hash,cases_json,config_json,source_job_id) VALUES (?,?,?,?,?)',
      id, snapshot.inputs_hash, snapshot.cases_json, snapshot.config_json, source.id);
  });
  return { id, sourceJobId: source.id, status: 'queued', inputsHash: snapshot.inputs_hash,
    deterministicOutputGuaranteed: false };
}

async function compare(db, options) {
  if (!Array.isArray(options.ids) || options.ids.length < 2 || options.ids.length > 8) {
    throw Object.assign(new Error('Comparer entre deux et huit jobs.'), { code: 'COMPARISON_INVALID', status: 400 });
  }
  const jobs = [];
  for (const id of options.ids) {
    const row = await scopedJob(db, { ...options, id });
    const snapshot = await load(db, id);
    const result = JSON.parse(row.result_json || 'null');
    jobs.push({ id, status: row.status, inputsHash: snapshot?.inputs_hash || null,
      sourceJobId: snapshot?.source_job_id || null, config: JSON.parse(row.config_json),
      metrics: result, error: JSON.parse(row.error_json || 'null'), qualityGuarantee: false });
  }
  const hashes = new Set(jobs.map(job => job.inputsHash));
  return { jobs, sameCapturedInputs: hashes.size === 1 && !hashes.has(null),
    note: 'Métriques observées, pas une preuve de promotion ni une garantie de qualité.' };
}

module.exports = { capture, load, replay, compare };

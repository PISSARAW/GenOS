'use strict';

const { requireActive } = require('./runtimeGuard');
const { sampleSensor, digest } = require('./sensorService');
const { recordProjectEffect } = require('./effectService');
const { monitorProjectEffect } = require('./monitoringService');

async function ensureJob(db, input) {
  const id = `shev_job_${digest([input.sensor.id, input.phase, input.subject, input.cycle || 'once'])}`;
  await db.run(`INSERT OR IGNORE INTO shev_runtime_jobs (id, project_id, sensor_id, phase, subject_id, actionable)
    VALUES (?, ?, ?, ?, ?, ?)`, [id, input.sensor.project_id, input.sensor.id, input.phase,
    input.subject, Number(input.phase === 'sensor')]);
  return db.get('SELECT * FROM shev_runtime_jobs WHERE id = ?', [id]);
}

async function sampleJob(db, input) {
  const { job, sensor } = input;
  if (job.observation_id) return db.get(`SELECT * FROM shev_observations
    WHERE id = ? AND project_id = ?`, [job.observation_id, sensor.project_id]);
  const sample = await sampleSensor(db, { sensor, sampleRef: job.id });
  await input.fence();
  await requireActive(db, { projectId: sensor.project_id, expectedVersion: sensor.mandate_version });
  const fingerprint = digest([sample.kind, sample.epistemicStatus, sample.evidenceRefs]);
  const alert = await db.get(`SELECT w.initiative_id FROM shev_watches w
    JOIN shev_initiatives i ON i.id = w.initiative_id
    JOIN shev_runtime_jobs j ON j.observation_id = i.observation_id AND j.project_id = i.project_id
    WHERE j.sensor_id = ? AND w.status = 'alert' LIMIT 1`, [sensor.id]);
  const actionable = job.phase === 'sensor' && sensor.last_signal_hash !== fingerprint && !alert;
  await db.run(`UPDATE shev_runtime_jobs SET observation_id = ?, actionable = ? WHERE id = ?`,
    [sample.id, Number(actionable), job.id]);
  if (job.phase === 'sensor') await db.run('UPDATE shev_sensors SET last_signal_hash = ? WHERE id = ?',
    [fingerprint, sensor.id]);
  return db.get('SELECT * FROM shev_observations WHERE id = ? AND project_id = ?', [sample.id, sensor.project_id]);
}

function verdict(observation, sensor) {
  return { result: observation.kind === 'state' ? 'confirmed' : 'regressed',
    verifierRef: `shev:${sensor.adapter}:runtime-v1`, evidenceRefs: JSON.parse(observation.evidence_json) };
}

async function assessJob(db, input) {
  const { sensor, job, observation } = input;
  if (job.phase === 'sensor') return { observationId: observation.id };
  if (observation.epistemic_status !== 'observed') return { result: 'inconclusive', observationId: observation.id };
  const common = { projectId: sensor.project_id, initiativeId: job.subject_id,
    verify: async () => verdict(observation, sensor) };
  if (job.phase === 'effect') return recordProjectEffect(db, { ...common,
    postObservationId: observation.id, monitoringIntervalMs: sensor.interval_ms });
  return monitorProjectEffect(db, { ...common, observationId: observation.id });
}

async function runJob(db, input) {
  const job = await ensureJob(db, input);
  if (job.status === 'done' || job.attempts >= 3) return { id: job.id, status: job.status };
  await input.fence();
  await requireActive(db, { projectId: input.sensor.project_id, expectedVersion: input.sensor.mandate_version });
  await db.run(`UPDATE shev_runtime_jobs SET status = 'running', attempts = attempts + 1,
    started_at = ? WHERE id = ?`, [new Date().toISOString(), job.id]);
  try {
    const observation = await sampleJob(db, { ...input, job });
    await input.fence();
    const receipt = await assessJob(db, { ...input, job, observation });
    await input.fence();
    await requireActive(db, { projectId: input.sensor.project_id, expectedVersion: input.sensor.mandate_version });
    await db.run(`UPDATE shev_runtime_jobs SET status = 'done', receipt_json = ?, completed_at = ?, error = NULL
      WHERE id = ?`, [JSON.stringify(receipt), new Date().toISOString(), job.id]);
    await advanceSchedule(db, { ...input, receipt });
    return { id: job.id, status: 'done', receipt };
  } catch (error) {
    await db.run("UPDATE shev_runtime_jobs SET status = 'blocked', error = ? WHERE id = ?", [error.message, job.id]);
    return { id: job.id, status: 'blocked', error: error.message };
  }
}

async function advanceSchedule(db, input) {
  const next = new Date(Date.now() + input.sensor.interval_ms).toISOString();
  if (input.phase === 'sensor') await db.run('UPDATE shev_sensors SET next_due_at = ? WHERE id = ?', [next, input.sensor.id]);
  if (input.phase === 'monitor' && input.receipt.result === 'inconclusive') {
    await db.run('UPDATE shev_watches SET next_due_at = ? WHERE initiative_id = ?', [next, input.subject]);
  }
}

async function jobsForSensor(db, sensor) {
  const completed = await db.all(`SELECT DISTINCT i.id FROM shev_initiatives i
    JOIN ontogenesis_backlog b ON b.id = i.task_id
    JOIN shev_runtime_jobs j ON j.observation_id = i.observation_id AND j.project_id = i.project_id
    LEFT JOIN shev_effects e ON e.initiative_id = i.id
    WHERE i.project_id = ? AND j.sensor_id = ? AND i.mandate_version = ?
      AND b.status = 'done' AND e.initiative_id IS NULL LIMIT 10`, [sensor.project_id, sensor.id, sensor.mandate_version]);
  const watches = await db.all(`SELECT DISTINCT w.* FROM shev_watches w
    JOIN shev_initiatives i ON i.id = w.initiative_id
    JOIN shev_runtime_jobs j ON j.observation_id = i.observation_id AND j.project_id = i.project_id
    WHERE i.project_id = ? AND j.sensor_id = ? AND w.status = 'active' AND w.next_due_at <= ? LIMIT 10`,
  [sensor.project_id, sensor.id, new Date().toISOString()]);
  return [...completed.map(row => ({ phase: 'effect', subject: row.id })),
    ...watches.map(row => ({ phase: 'monitor', subject: row.initiative_id, cycle: row.next_due_at }))];
}

async function tickProject(db, input) {
  const responsibility = await requireActive(db, { projectId: input.projectId }).catch(error => {
    if (error.code === 'SHEV_INACTIVE') return null;
    throw error;
  });
  if (!responsibility) return { status: 'inactive', jobs: [] };
  if (typeof input.fence !== 'function') throw new Error('SHEV runtime requires the host project claim fence.');
  const sensors = await db.all(`SELECT * FROM shev_sensors WHERE project_id = ?
    AND mandate_version = ? AND status = 'active' ORDER BY id LIMIT 20`, [input.projectId, responsibility.mandateVersion]);
  const jobs = [];
  for (const sensor of sensors) {
    for (const job of await jobsForSensor(db, sensor)) jobs.push(await runJob(db, { ...job, sensor, fence: input.fence }));
    if (Date.parse(sensor.next_due_at) <= Date.now()) jobs.push(await runJob(db,
      { sensor, phase: 'sensor', subject: sensor.next_due_at, fence: input.fence }));
  }
  const actions = await require('./runtimeActions').tickActions(db, input);
  return { status: jobs.length || actions.length ? 'observed' : 'quiescent', jobs, actions };
}

module.exports = { tickProject };

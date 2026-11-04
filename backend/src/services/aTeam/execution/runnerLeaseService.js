'use strict';
const store = require('../teamRunStore');
const LEASE_MS = 20 * 60 * 1000;
const RENEW_BEFORE_MS = 120000;

function assertLease(run, token) {
  const lease = run?.execution?.runnerLease;
  const expiresAt = Date.parse(lease?.expiresAt);
  if (!token || lease?.token !== token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || run.status !== 'RUNNING') {
    throw Object.assign(new Error('A-Team runner lease is absent, expired or superseded.'), { code: 'ATEAM_RUN_LEASE_LOST' });
  }
}

async function requireLease(input) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const run = await store.load(input.db, input.teamRunId);
    assertLease(run, input.runnerToken);
    if (Date.parse(run.execution.runnerLease.expiresAt) - Date.now() >= RENEW_BEFORE_MS) return run;
    try {
      return await renew(input, run);
    } catch (error) {
      if (error.code !== 'ATEAM_RUN_CONFLICT' || attempt === 2) throw error;
    }
  }
}

async function renew(input, run) {
  const result = await input.db.run(`UPDATE topology_sessions SET
    state_json=json_set(state_json,'$.execution.runnerLease.expiresAt',?),
    revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND topology='a_team' AND revision=?
    AND json_extract(state_json,'$.status')='RUNNING'
    AND json_extract(state_json,'$.execution.runnerLease.token')=?
    AND julianday(json_extract(state_json,'$.execution.runnerLease.expiresAt'))>julianday('now')`,
  new Date(Date.now() + LEASE_MS).toISOString(), run.teamRunId, run.revision, input.runnerToken);
  if (result.changes !== 1) throw Object.assign(new Error('A-Team lease renewal lost its current revision.'), { code: 'ATEAM_RUN_CONFLICT' });
  const updated = await store.load(input.db, input.teamRunId);
  assertLease(updated, input.runnerToken);
  return updated;
}

async function withRunnerLease(input, action) {
  await requireLease(input);
  let pending = Promise.resolve(), lost = null;
  const timer = setInterval(() => {
    pending = pending.then(() => requireLease(input)).catch(error => {
      lost = error;
      clearInterval(timer);
    });
  }, input.heartbeatMs || 30000);
  timer.unref();
  try {
    const result = await action();
    clearInterval(timer);
    await pending;
    if (lost) throw lost;
    await requireLease(input);
    return result;
  } finally {
    clearInterval(timer);
    await pending;
  }
}

module.exports = { assertLease, requireLease, withRunnerLease };

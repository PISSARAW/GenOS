'use strict';

const runs = require('../teamRunStore');

function assertRepairLease(run, token) {
  const lease = run.execution?.runnerLease;
  if (run.status !== 'RUNNING' || !token || lease?.token !== token || Date.parse(lease.expiresAt) <= Date.now()) {
    throw Object.assign(new Error('Quality repair requires the active A-Team runner lease.'), { code: 'ATEAM_RUN_LEASE_LOST' });
  }
  if (!Number.isFinite(Date.parse(lease.expiresAt))) {
    throw Object.assign(new Error('Quality repair lease expiry is invalid.'), { code: 'ATEAM_RUN_LEASE_LOST' });
  }
}

async function persistRepair(input, member, record) {
  const run = await requireRepairLease(input);
  const prior = run.execution.qualityRepairs?.[member.workerId];
  if (record.status === 'dispatching' && ['dispatching', 'awaiting_evidence'].includes(prior?.status)) {
    throw Object.assign(new Error('A quality repair is already reserved.'), { code: 'ATEAM_QUALITY_REPAIR_BUSY' });
  }
  const qualityRepairs = { ...run.execution.qualityRepairs, [member.workerId]: record };
  const saved = await runs.update({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { execution: { ...run.execution, qualityRepairs } } });
  input.run = saved;
  return record;
}

async function requireRepairLease(input) {
  const run = await runs.load(input.db, input.run.teamRunId);
  assertRepairLease(run, input.runnerToken);
  input.run = run;
  return run;
}

module.exports = { assertRepairLease, persistRepair, requireRepairLease };

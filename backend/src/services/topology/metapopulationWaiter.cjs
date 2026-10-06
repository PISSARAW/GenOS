'use strict';

async function waitForMetapopulationWorkers(db, members, timeoutMs) {
  const requested = Number(timeoutMs);
  const limit = Number.isFinite(requested) ? Math.max(10000, Math.min(requested, 600000)) : 180000;
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const rows = await Promise.all(members.map((member) => db.get('SELECT status FROM agents WHERE id = ?', member.workerId)));
    if (rows.every((row) => ['completed', 'failed', 'error', 'blocked', 'unverified', 'terminated', 'quarantined'].includes(row?.status))) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

module.exports = { waitForMetapopulationWorkers };
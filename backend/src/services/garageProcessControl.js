'use strict';

const { activeProcesses, missionStarts } = require('./agentOrchestrationState');
const { error } = require('./garageRequests');

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch (failure) { return failure.code !== 'ESRCH'; }
}

async function isAlive(db, workerId) {
  if (activeProcesses.has(workerId) || missionStarts.has(workerId)) return true;
  const worker = await db.get('SELECT runtime_pid FROM agents WHERE id = ?', workerId);
  return pidAlive(worker?.runtime_pid);
}

async function stopVerified(input) {
  const worker = await input.db.get('SELECT runtime_pid FROM agents WHERE id = ?', input.workerId);
  const pid = worker?.runtime_pid || activeProcesses.get(input.workerId)?.pid;
  await (input.stopMission || require('./agentRuntimeAdapter').stopMission)(input.workerId);
  const deadline = Date.now() + Math.min(30000, Math.max(100, input.timeoutMs || 15000));
  while (Date.now() < deadline) {
    if (!pidAlive(pid) && !await isAlive(input.db, input.workerId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw error('GARAGE_STOP_UNVERIFIED', 'Runtime shutdown was not confirmed; its slot cannot be reused.');
}

module.exports = { pidAlive, isAlive, stopVerified };

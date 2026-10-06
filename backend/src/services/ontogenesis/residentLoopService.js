'use strict';

const { setTimeout: delay } = require('timers/promises');
const { tickOnce } = require('./tickService');
const { stopProject } = require('./controlService');

function loopOptions(input) {
  const intervalMs = Number(input.intervalMs ?? 5000);
  const maxTicks = Number(input.maxTicks ?? 0);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 10) throw new Error('intervalle-resident-invalide');
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 0) throw new Error('nombre-ticks-invalide');
  return { intervalMs, maxTicks };
}

function signature(outcome) {
  return JSON.stringify([outcome.state, outcome.note, outcome.reason, outcome.operationId, outcome.sha]);
}

async function stopResident(db, input, dependencies) {
  await stopProject(db, { projectId: input.projectId, reason: 'signal-operateur' });
  let outcome;
  do {
    outcome = await dependencies.tick(db, input);
    if (outcome.state === 'STOPPED') break;
    await delay(dependencies.intervalMs);
  } while (outcome.note === 'attente-arret-workers' || outcome.reason === 'claim-actif');
  await dependencies.onChange(outcome);
  return outcome;
}

async function waitInterval(intervalMs, signal) {
  try { await delay(intervalMs, undefined, { signal }); }
  catch (error) { if (error.name !== 'AbortError') throw error; }
}

async function runResidentLoop(db, input, dependencies = {}) {
  const options = loopOptions(input);
  const tick = dependencies.tick || tickOnce;
  const onChange = dependencies.onChange || (() => {});
  let previous;
  let count = 0;
  let outcome;
  while (!input.signal?.aborted) {
    outcome = await tick(db, input);
    count += 1;
    const current = signature(outcome);
    if (current !== previous) await onChange({ count, ...outcome });
    previous = current;
    if (outcome.state === 'STOPPED') break;
    if (options.maxTicks > 0 && count >= options.maxTicks) break;
    await waitInterval(options.intervalMs, input.signal);
  }
  if (input.signal?.aborted) {
    outcome = await stopResident(db, input, { tick, onChange, intervalMs: options.intervalMs });
  }
  return { count, ...outcome };
}

module.exports = { loopOptions, runResidentLoop };

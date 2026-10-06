'use strict';

const { launchWorker } = require('./workerLauncher.cjs');
const biologicalWorkerCompletion = require('../biologicalWorkerCompletionService.js');

function selectMembers(members, available, waveSize) {
  if (!Array.isArray(members)) return [];
  const workers = members.filter((member) => member.executionMode !== 'orchestrator');
  const required = Math.min(workers.length, waveSize || workers.length);
  if (available < required) {
    throw Object.assign(new Error(`Biological dispatch requires ${required} free worker slots, but only ${available} available`), { code: 'WORKER_GARAGE_FULL' });
  }
  return workers;
}

async function dispatchBiologicalMembersCore({ db, context, mode, parent, selected, waves }) {
  if (waves) {
    const completed = [];
    for (let offset = 0; offset < selected.length; offset += 2) {
      const pair = selected.slice(offset, offset + 2);
      if (mode === 'metapopulation') {
        completed.push(...await Promise.all(pair.map((member, index) =>
          launchWorker({ db, context, member, index: offset + index + 1, parent }))));
        continue;
      }
      const pairResults = await Promise.allSettled(
        pair.map((member, index) => launchWorker({ db, context, member, index: offset + index + 1, parent }))
      );
      for (let index = 0; index < pairResults.length; index += 1) {
        const result = pairResults[index];
        if (result.status === 'fulfilled') {
          completed.push(result.value);
        } else {
          dispatchBiologicalMembersValues({ context, pair, index, result });
          console.error(`[topology] Worker launch failed: ${result.reason?.message || result.reason}`);
        }
      }
    }
    return completed;
  }
  return Promise.all(selected.map((member, index) => launchWorker({ db, context, member, index: index + 1, parent })));
}

function dispatchBiologicalMembersValues({ context, pair, index, result }) {
  return biologicalWorkerCompletion.recordDispatchFailure(context, pair[index]?.role || 'unknown', result.reason?.message || 'worker_launch_failed');
}

module.exports = { dispatchBiologicalMembersCore, selectMembers, dispatchBiologicalMembersValues };
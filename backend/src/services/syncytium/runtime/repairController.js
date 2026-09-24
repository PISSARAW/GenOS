'use strict';

function createRepairController(syncytium) {
  return {
    inspect: (sessionId, options) => inspect(sessionId, options, syncytium),
    repair: (sessionId, request) => syncytium.repairInvariant(sessionId, request || {})
  };
}

async function inspect(sessionId, options = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, options);
  const consistency = snapshot.consistency;
  if (consistency.verdict === 'consistent') return { required: false, consistency, faults: [], candidates: [] };
  const faults = await syncytium.localizeFaults(sessionId, options);
  const candidates = syncytium.chooseRepairCandidates(faults.candidates || []);
  return { required: true, consistency, faults, candidates };
}

module.exports = { createRepairController };

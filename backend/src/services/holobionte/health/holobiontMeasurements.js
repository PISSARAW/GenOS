'use strict';

const store = require('../holobiontStore');

function concentration(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? Math.max(...values) / total : 0;
}

function capabilityCounts(residents) {
  const counts = new Map();
  for (const resident of residents.filter((item) => item.status === 'RESIDENT')) {
    for (const capability of new Set(resident.capabilities || [])) counts.set(capability, (counts.get(capability) || 0) + 1);
  }
  return [...counts.values()];
}

async function deriveDysbiosisSignals(db, holobiontId) {
  const session = await store.getSession(db, holobiontId);
  const records = session.verifiedContributions || [];
  const resourceTotals = new Map();
  for (const record of records) {
    const tokens = Number(record.resourcesConsumed?.tokens || 0);
    resourceTotals.set(record.symbiontId, (resourceTotals.get(record.symbiontId) || 0) + tokens);
  }
  const counts = capabilityCounts(session.residentSymbionts);
  const events = session.immuneState.rejections || [];
  return { resourceConcentration: concentration([...resourceTotals.values()]),
    dependencyConcentration: counts.length ? counts.filter((count) => count === 1).length / counts.length : 0,
    harmfulActivity: records.length ? records.filter((record) => record.riskScore >= 0.8).length / records.length : 0,
    conflictRate: events.length / Math.max(1, events.length + records.length),
    immunePressure: events.length / Math.max(1, events.length + records.length),
    functionalRedundancy: counts.length ? counts.filter((count) => count > 1).length / counts.length : 0 };
}

module.exports = { deriveDysbiosisSignals };

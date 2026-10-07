'use strict';

async function forRun(db, binding) {
  if (!await db.get("SELECT name FROM sqlite_master WHERE name='gvx_development_events'")) return null;
  const journal = require('./nativeOracleJournal');
  const scope = { ...binding.tenant, entityId: binding.workerId };
  const allocation = await journal.read(db, { runId: binding.runId, scope, kind: 'reservation' });
  if (!allocation) return null;
  const costs = await require('./nativeOracleExecutionJournal').costs(db, { allocation });
  const limits = allocation.value.limits;
  return { schema: 'genos.native-oracle-cost-reference/v1', allocationHash: allocation.hash,
    eventId: allocation.eventId, costs,
    budgetAssessment: { limits, satisfied: costs.complete && costs.processes <= limits.executions && costs.runtimeMs <= limits.latencyMs,
      localComputeUsdMeasured: costs.localComputeUsd !== null } };
}

module.exports = { forRun };

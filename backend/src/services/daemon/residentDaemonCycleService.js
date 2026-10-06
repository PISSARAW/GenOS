'use strict';

const fs = require('node:fs');
const runtime = require('./residentDaemonRuntime');
const territories = require('./daemonTerritoryService');
const cartographer = require('./cartography/cartographerService');
const interoception = require('./daemonTerritoryInteroceptionService');
const phenotypes = require('./specialization/phenotypeService');
const attention = require('./specialization/phenotypeExecutionService');
const investigator = require('./investigation/residentInvestigatorService');
const findings = require('./findings/findingService');
const verifier = require('./verification/verifierService');
const stigmergy = require('./daemonStigmergyService');
const reconciler = require('./reconciliation/reconcilerService');
const scouts = require('./scouting/scoutColonyService');
const scheduler = require('./scheduling/computeScheduler');
const search = require('./daemonSearchStateService');
const flights = new WeakMap();

function runCycle(context) {
  if (!context?.runtime || !context.db) return Promise.resolve({ cycled: false, reason: 'context-required' });
  const pending = flights.get(context.runtime);
  if (pending) return pending;
  const work = guardedCycle(context).finally(() => flights.delete(context.runtime));
  flights.set(context.runtime, work);
  return work;
}

async function guardedCycle(context) {
  try { return await executeCycle(context); }
  catch (error) {
    context.retryInvestigation = true;
    await runtime.heartbeat(context.runtime, { daemonId: context.daemonId, activity: 'BOOTSTRAPPING', health: 'DEGRADED' }).catch(() => {});
    throw error;
  } finally { await search.save(context); }
}

function drain(runtimeState) {
  return flights.get(runtimeState) || Promise.resolve();
}

async function move(context, activity) {
  const receipt = await runtime.heartbeat(context.runtime, { daemonId: context.daemonId, activity });
  if (!receipt.updated || receipt.activity !== activity) throw new Error(`Daemon transition to ${activity} failed`);
}

async function bootstrap(context, territory) {
  if (!fs.existsSync(territory.rootPath)) throw new Error('Territory root is unavailable');
  await move(context, 'SURVEYING');
  const indexed = await cartographer.scanTerritory(context.db, {
    territoryId: territory.id, rootPath: territory.rootPath, scopePath: territory.scopePath
  });
  if (indexed.scanned === false) throw new Error(indexed.reason);
  await scouts.loadColonies(context.db);
  await move(context, 'DORMANT');
  return indexed;
}

async function executeCycle(context) {
  const state = await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId });
  const stored = await territories.getTerritory(context.db, { id: context.territoryId });
  if (!state.found || !stored.found) return { cycled: false, reason: 'unregistered-daemon-or-territory' };
  if (state.territoryId !== stored.territory.id) return { cycled: false, reason: 'territory-mismatch' };
  if (['APOPTOTIC', 'SENESCENT'].includes(state.health)) return { cycled: false, reason: 'daemon-retired' };
  await search.ensure(context);
  const index = await refreshIndex(context, { state, territory: stored.territory });
  const sensed = await interoception.senseTerritory(context.db, context.territoryId);
  const assigned = await phenotypes.assignPhenotypes(context.db, { territoryId: context.territoryId });
  const active = assigned.phenotypes.filter((row) => row.status === 'ACTIVE').map((row) => row.family);
  const pressures = interoception.combinePressures(sensed.variables, context.machineVariables);
  const plan = scheduler.planCycle({ pressures, activity: state.activity, budget: { wakesLeft: 0 } });
  let current = await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId });
  if (context.retryInvestigation && current.activity === 'DORMANT') {
    await move(context, 'FOCUSED');
    current = await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId });
  }
  const investigation = current.activity === 'FOCUSED' ? await investigate(context, { territory: stored.territory, active }) : null;
  const searchPressure = await search.update(context);
  const sweep = await maybeReconcile(context);
  return { cycled: true, index, sensing: sensed, phenotypes: assigned.phenotypes, plan, investigation, searchPressure, reconciliation: sweep };
}

async function refreshIndex(context, job) {
  if (job.state.activity === 'BOOTSTRAPPING') return bootstrap(context, job.territory);
  const stale = job.territory.state === 'STALE' || job.territory.indexedHeadSha !== job.territory.headSha;
  if (!stale || Date.now() - (context.lastIndexAttemptAt || 0) < 60000) return null;
  context.lastIndexAttemptAt = Date.now();
  return cartographer.scanTerritory(context.db, { territoryId: job.territory.id,
    rootPath: job.territory.rootPath, scopePath: job.territory.scopePath });
}

async function investigate(context, job) {
  context.retryInvestigation = true;
  await search.save(context);
  await move(context, 'INVESTIGATING');
  const detected = await investigator.investigate(context.db, {
    territoryId: context.territoryId, daemonId: context.daemonId,
    rootPath: job.territory.rootPath, ledger: context.ledger,
    detectors: attention.selectDetectors(job.active)
  });
  await move(context, 'VERIFYING');
  const open = await findings.listFindings(context.db, { territoryId: context.territoryId });
  const verified = [];
  for (const finding of open.filter((row) => !['REFUTED', 'EXPIRED', 'STALE', 'REPAIRABLE'].includes(row.status)).slice(0, 20)) {
    verified.push(await verifier.verifyFinding(context.db, { findingId: finding.id, daemonId: context.daemonId }));
  }
  await markObservations(context, detected);
  await move(context, 'REPORTING');
  await move(context, 'DORMANT');
  context.retryInvestigation = false;
  return { ...detected, verification: verified };
}

async function markObservations(context, detected) {
  for (const observation of (detected.observations || []).slice(0, 20)) {
    const kinds = { 'secret-exposure': 'HIGH_RISK', 'contract-drift': 'CONTRACT_DRIFT', 'cross-repo-drift': 'CONTRACT_DRIFT', 'knowledge-gap': 'DEAD_END', 'resource-anomaly': 'DEAD_END' };
    const kind = kinds[observation.detectorId] || 'TEST_INSTABILITY';
    const marker = { territoryId: context.territoryId, scope: observation.scope.value, kind, intensity: 1 };
    const prior = await stigmergy.getMarker(context.db, marker);
    if (!prior.deposited) await stigmergy.depositMarker(context.db, marker);
  }
}

async function maybeReconcile(context) {
  const now = Date.now();
  if (now - (context.lastReconciledAt || 0) < 60000) return null;
  const receipt = await reconciler.sweep(context.db, { territoryId: context.territoryId });
  await scouts.sweepScoutColonies(context.db);
  context.lastReconciledAt = now;
  return receipt;
}

module.exports = { runCycle, drain };

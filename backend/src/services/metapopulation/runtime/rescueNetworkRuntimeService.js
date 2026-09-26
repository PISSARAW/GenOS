'use strict';
const { planRescueMigration, evaluateRescueOutcome } = require('../migration/rescueEffectService');

async function globalRecolonizationAutomator(session, atRiskDemes, options) {
  const actions = [];
  for (const deme of atRiskDemes) {
    if (deme.status !== 'AT_RISK') continue;
    const rescuePlan = await planRescueMigration(
      {
        metapopulationId: session.metapopulationId,
        targetDemeId: deme.demeId,
        targetFitness: deme.fitness?.score ?? 0.1,
        candidates: options.candidates || [],
        maxAttempts: 2,
        maxTrials: 1,
      },
      options
    );
    if (rescuePlan.allowed && rescuePlan.trials.length > 0) {
      const trial = rescuePlan.trials[0];
      actions.push({
        type: 'RESCUE_MIGRATION',
        trialId: trial.trialId,
        propagule: trial.propagule,
        targetDemeId: deme.demeId,
      });
    }
  }
  return actions;
}

function reserveCorridorManager(corridors, atRiskDemes) {
  const reserve = corridors.filter((c) => c.isReserve);
  const active = corridors.filter((c) => !c.isReserve && atRiskDemes.some((d) => d.demeId === c.sourceDemeId));
  return {
    reserveCorridors: reserve,
    activeCorridors: active,
    reserveCapacity: reserve.reduce((s, c) => s + (c.capacity || 1), 0),
    recommendActivation: reserve.length > 0 && atRiskDemes.length > 0,
  };
}

function chaosBenchmark(session, chaosInjector, options) {
  const before = {
    demeCount: session.demes.length,
    activeCount: session.demes.filter((d) => d.status === 'ACTIVE').length,
    coverage: session.demes.reduce((s, d) => s + (d.fitness?.score || 0), 0) / Math.max(1, session.demes.length),
  };
  const injected = chaosInjector.inject(session, options);
  const after = {
    demeCount: session.demes.length,
    activeCount: session.demes.filter((d) => d.status === 'ACTIVE').length,
    coverage: session.demes.reduce((s, d) => s + (d.fitness?.score || 0), 0) / Math.max(1, session.demes.length),
  };
  return { before, injected, after, recoveryDelta: after.coverage - before.coverage };
}

function maintainFounderReserve(demes, reserve) {
  const staged = reserveStagedLineages(reserve);
  const atRiskCount = (demes || []).filter((deme) => deme.status === 'AT_RISK').length;
  const deficit = Math.max(0, reserve.desiredSize - staged.length);
  return { staged: staged.length, desiredSize: reserve.desiredSize, deficit, needsStaging: deficit > 0, atRiskCount };
}

function reserveStagedLineages(reserve) {
  return ((reserve && reserve.staged) || []).filter((entry) => entry && entry.lineageId);
}

module.exports = { globalRecolonizationAutomator, reserveCorridorManager, chaosBenchmark, maintainFounderReserve };

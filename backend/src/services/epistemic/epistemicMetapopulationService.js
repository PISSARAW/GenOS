'use strict';

/**
 * Métapopulation épistémique.
 *
 * Isole des populations de raisonnement pour éviter la contamination
 * (convergence forcée, groupthink). Chaque population produit son résultat
 * indépendamment. Seuls les résultats migrent, jamais les prompts.
 *
 * La convergence indépendante (population A et B arrivent à la même réponse
 * sans s'influencer) est plus robuste qu'un accord après influence mutuelle.
 */

const crypto = require('node:crypto');

function populationId() {
  return `pop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function createPopulation(opts = {}) {
  return {
    id: opts.id || populationId(),
    niche: opts.niche || 'general',
    strategy: opts.strategy || ['default'],
    provider: opts.provider || 'unknown',
    isolation: opts.isolation !== false,
    members: opts.members || [],
    results: [],
    createdAt: new Date().toISOString(),
  };
}

function addResult(population, result) {
  const entry = {
    id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    claim: result.claim,
    evidence: result.evidence || null,
    confidence: result.confidence || 0.5,
    strategy: population.strategy,
    provider: population.provider,
    niche: population.niche,
    producedAt: new Date().toISOString(),
  };
  population.results.push(entry);
  return entry;
}

function migrateResults(source, target, opts = {}) {
  if (!source.results.length) return [];
  const migrated = source.results.map((r) => ({
    ...r,
    migratedFrom: source.id,
    migratedTo: target.id,
    migrationId: `mig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    migratedAt: new Date().toISOString(),
  }));
  if (opts.append !== false) {
    target.results.push(...migrated);
  }
  return migrated;
}

function independentConvergence(populations = []) {
  if (populations.length < 2) return null;
  const claimSets = populations.map((p) => new Set(p.results.map((r) => r.claim)));
  const common = [...claimSets[0]].filter((claim) => claimSets.every((s) => s.has(claim)));
  return {
    convergenceCount: common.length,
    convergenceRate: claimSets[0].size > 0 ? common.length / claimSets[0].size : 0,
    populations: populations.length,
    commonClaims: common,
  };
}

function crossContamination(populations = []) {
  if (populations.length < 2) return 0;
  const allClaims = populations.flatMap((p) => p.results.map((r) => r.claim));
  const unique = new Set(allClaims);
  return allClaims.length > 0 ? 1 - unique.size / allClaims.length : 0;
}

function migrationPlan(populations = []) {
  const plan = [];
  for (let i = 0; i < populations.length; i += 1) {
    for (let j = i + 1; j < populations.length; j += 1) {
      plan.push({
        from: populations[i].id,
        to: populations[j].id,
        reason: 'controlled migration: result exchange only',
        allowed: populations[i].isolation && populations[j].isolation,
      });
    }
  }
  return plan;
}

function metapopulationReport(populations = []) {
  return {
    populations: populations.length,
    totalResults: populations.reduce((sum, p) => sum + p.results.length, 0),
    convergence: independentConvergence(populations),
    crossContamination: crossContamination(populations),
    migrationPlan: migrationPlan(populations),
  };
}

module.exports = {
  populationId,
  createPopulation,
  addResult,
  migrateResults,
  independentConvergence,
  crossContamination,
  migrationPlan,
  metapopulationReport,
};

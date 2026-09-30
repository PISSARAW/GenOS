'use strict';

/**
 * Métapopulation épistémique.
 *
 * Isole des populations de raisonnement pour éviter la contamination
 * (convergence forcée, groupthink). Chaque population produit son résultat
 * indépendamment. Seuls les résultats migrent, jamais les prompts.
 *
 * Distinction cruciale :
 *  - nativeResult : produit par la population elle-même (compte pour convergence)
 *  - migratedResult : copié depuis une autre population (ne compte PAS)
 *
 * La contamination se détecte par provenance et flux d'information,
 * pas par égalité des conclusions.
 */

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
    nativeResults: [],
    migratedResults: [],
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
    provenance: 'native',
  };
  population.results.push(entry);
  population.nativeResults.push(entry);
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
    provenance: 'migrated',
  }));
  if (opts.append !== false) {
    target.results.push(...migrated);
    target.migratedResults.push(...migrated);
  }
  return migrated;
}

function independentConvergence(populations = []) {
  if (populations.length < 2) return null;
  // Mesurer la convergence uniquement sur les résultats natifs (pré-migration).
  const claimSets = populations.map((p) => new Set(p.nativeResults.map((r) => r.claim)));
  const common = [...claimSets[0]].filter((claim) => claimSets.every((s) => s.has(claim)));
  return {
    convergenceCount: common.length,
    convergenceRate: claimSets[0].size > 0 ? common.length / claimSets[0].size : 0,
    populations: populations.length,
    commonClaims: common,
    basedOnNativeResults: true,
  };
}

function crossContamination(populations = []) {
  // La contamination se mesure par flux d'information, pas par égalité des claims.
  // Si une population a des résultats migrés d'une autre, c'est de la contamination.
  const totalMigrated = populations.reduce((sum, p) => sum + (p.migratedResults?.length || 0), 0);
  const totalResults = populations.reduce((sum, p) => sum + (p.results?.length || 0), 0);
  return totalResults > 0 ? totalMigrated / totalResults : 0;
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
    nativeResults: populations.reduce((sum, p) => sum + p.nativeResults.length, 0),
    migratedResults: populations.reduce((sum, p) => sum + p.migratedResults.length, 0),
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

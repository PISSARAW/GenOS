'use strict';

/**
 * @file mathematicalOrganismObserve.js
 * @description Observation phase for MathematicalOrganismRuntime
 */

function observe(runtime) {
  const observations = {
    niches: [],
    lineages: [],
    anomalies: [],
    stigmergicTraces: [],
  };

  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (!pop) continue;

    for (const [, lineage] of pop.lineages) {
      observations.lineages.push({
        id: lineage.id,
        niche: niche.id,
        fitness: lineage.fitness,
        generation: lineage.generation,
        strategies: lineage.genome.strategies,
      });
    }

    observations.stigmergicTraces.push(...niche.stigmergicTraces.slice(-10));

    const mvt = niche.evaluateMVT(runtime.nicheService.envMeanReturnRate);
    observations.niches.push({
      id: niche.id,
      name: niche.name,
      representation: niche.representation,
      lineages: niche.lineages.size,
      totalInfoGain: niche.totalInfoGain,
      mvt: mvt,
    });

    if (mvt.shouldDepart) {
      observations.anomalies.push({
        type: 'mvt_departure',
        niche: niche.id,
        description: `Niche ${niche.name} marginal yield ${mvt.marginalYield.toFixed(3)} below threshold ${mvt.envThreshold}`,
        confidence: 0.8,
      });
    }
  }

  for (const lineage of observations.lineages) {
    if (lineage.fitness) {
      const avgFitness = Object.values(lineage.fitness).reduce((a, b) => a + b, 0) / 7;
      if (avgFitness < 0.2 && lineage.generation > 5) {
        observations.anomalies.push({
          type: 'fitness_stagnation',
          lineage: lineage.id,
          description: `Lineage ${lineage.id} fitness stagnant at ${avgFitness.toFixed(3)} for ${lineage.generation} generations`,
          confidence: 0.7,
        });
      }
    }
  }

  return observations;
}

function extractMotifs(traces) {
  const typeCounts = {};
  for (const trace of traces) {
    typeCounts[trace.type] = (typeCounts[trace.type] || 0) + 1;
  }
  return Object.entries(typeCounts)
    .filter(([, count]) => count >= 3)
    .map(([type]) => type);
}

module.exports = { observe, extractMotifs };
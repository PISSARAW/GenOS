'use strict';

/**
 * @file mathematicalOrganismSelectMutate.js
 * @description Select, mutate, transmit, and HGT phases for MathematicalOrganismRuntime
 */

function select(runtime) {
  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (!pop) continue;

    const selected = pop.selectTop(3);
    const extinct = pop.extinguish(0.1, 3);

    for (const [, lineage] of pop.lineages) {
      if (!selected.includes(lineage) && !extinct.includes(lineage.id) && Math.random() < 0.1) {
        pop.dormant(lineage.id);
      }
    }
  }
}

function mutate(runtime) {
  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (!pop) continue;

    const lineages = [...pop.lineages.values()];

    for (const lineage of lineages) {
      runtime.mutationEngine.pointMutate(lineage);

      if (lineages.length > 1 && Math.random() < runtime.mutationEngine.recombinationRate) {
        const partner = lineages[Math.floor(Math.random() * lineages.length)];
        if (partner.id !== lineage.id) {
          const result = runtime.mutationEngine.recombine(lineage, partner);
          runtime.metrics.totalMutations++;
          if (result && result.child) {
            assimilateChild(runtime, pop, result.child);
          }
        }
      }

      runtime.mutationEngine.exapt(lineage, niche.representation);
    }
  }
}

function assimilateChild(runtime, pop, child) {
  // Naissance biomimétique dans la population parentale (deme).
  // L'enfant est ajouté UNIQUEMENT à la population parentale.
  // Toute migration future (allocateToBestNiche) se fera explicitement,
  // évitant la double appartenance simultanée parent/enfant niches.
  const parent = pop.lineages.get(child.parents?.[0] || '');
  const baseFitness = parent?.fitness || { P: 0.1, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 };
  const d = (Math.random() - 0.5) * 0.1;
  child.fitness = {
    P: Math.min(1, baseFitness.P + d), N: Math.min(1, baseFitness.N + d),
    I: Math.min(1, baseFitness.I + d), A: baseFitness.A,
    T: Math.min(1, baseFitness.T + d), R: Math.min(1, baseFitness.R + d), C: baseFitness.C,
  };
  pop.addLineage(child);
  // Enregistrement global dans l'environnement (identité globale) :
  // environment = identité globale, population = localisation écologique.
  if (runtime.environment) {
    runtime.environment.addLineage(child);
  }
}

function transmit(runtime, verifiedAttempts) {
  for (const attempt of verifiedAttempts) {
    if (!attempt.artifact) continue;

    const culturalArtifact = runtime.culture.addArtifact({
      type: 'lemma',
      content: attempt.artifact.statement,
      source: attempt.lineageId,
      proofArtifact: attempt.artifact,
    });

    for (const [, niche] of runtime.nicheService.niches) {
      const pop = niche.population;
      if (!pop) continue;

      for (const [, lineage] of pop.lineages) {
        if (lineage.id !== attempt.lineageId) {
          runtime.culture.transmit(culturalArtifact.id, lineage);
          runtime.metrics.totalTransmissions++;
        }
      }
    }
  }
}

function horizontalTransfer(runtime) {
  const allLineages = [];
  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (pop) {
      allLineages.push(...pop.lineages.values());
    }
  }

  for (let i = 0; i < Math.min(5, allLineages.length); i++) {
    const source = allLineages[Math.floor(Math.random() * allLineages.length)];
    const target = allLineages[Math.floor(Math.random() * allLineages.length)];
    if (source.id !== target.id) {
      const immuneReport = immuneCheck(source, target);
      if (immuneReport.blocked) continue;

      // Find a verified ProofArtifact from source lineage's knowledge
      const verifiedArtifact = findVerifiedArtifact(source);
      if (!verifiedArtifact) continue; // Skip HGT if no verified artifact available

      const result = runtime.mutationEngine.horizontalGeneTransfer(source, target, verifiedArtifact, immuneReport);
      if (result) {
        runtime.metrics.totalHGT++;
      }
    }
  }
}

function findVerifiedArtifact(lineage) {
  // Check lineage's knowledge for verified ProofArtifacts
  if (!lineage._knowledge) return null;
  for (const knowledge of lineage._knowledge) {
    if (knowledge.verified && knowledge.proofArtifact && knowledge.proofArtifact.isVerified()) {
      return knowledge.proofArtifact;
    }
  }
  return null;
}

function immuneCheck(source, target) {
  const sourceFit = source.fitness ? Object.values(source.fitness).reduce((a, b) => a + b, 0) / 7 : 0;
  const targetFit = target.fitness ? Object.values(target.fitness).reduce((a, b) => a + b, 0) / 7 : 0;

  if (Math.abs(sourceFit - targetFit) > 0.5) {
    return { blocked: true, blockReason: 'fitness_incompatibility', sourceFitness: sourceFit, targetFitness: targetFit };
  }

  if (!source.fitness || source.fitness.P < 0.1) {
    return { blocked: true, blockReason: 'unverified_source', sourceFitness: sourceFit };
  }

  return { blocked: false };
}

function evaluate(runtime) {
  let totalInfoGain = 0;
  let totalTimeCost = 0;
  for (const [, niche] of runtime.nicheService.niches) {
    if (niche.resourceHistory.length > 0) {
      for (const entry of niche.resourceHistory) {
        totalInfoGain += entry.infoGain;
        totalTimeCost += entry.timeCost;
      }
    }
  }
  if (totalTimeCost > 0) {
    runtime.nicheService.envMeanReturnRate = totalInfoGain / totalTimeCost;
  }

  runtime.nicheService.evaluateAndMigrate();
}

function hasConverged(runtime) {
  let verifiedCount = 0;
  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (!pop) continue;
    for (const [, lineage] of pop.lineages) {
      if (lineage.fitness && lineage.fitness.P > 0.8) {
        verifiedCount++;
      }
    }
  }
  return verifiedCount > 0 && runtime.currentStep > 10;
}

function getSummary(runtime) {
  return {
    id: runtime.id,
    problem: runtime.environment?.problem?.statement,
    step: runtime.currentStep,
    generation: runtime.generation,
    budget: { ...runtime.budget, spent: { ...runtime.spent } },
    metrics: { ...runtime.metrics },
    niches: runtime.nicheService.niches.size,
    totalLineages: [...runtime.nicheService.niches.values()].reduce((sum, n) => sum + (n.population?.lineages.size || 0), 0),
    cultureArtifacts: runtime.culture.artifacts.size,
    questions: runtime.questionogenesis.questions.size,
    history: runtime.history.slice(-20),
  };
}

module.exports = { select, mutate, transmit, horizontalTransfer, immuneCheck, evaluate, hasConverged, getSummary };
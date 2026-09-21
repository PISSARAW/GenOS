'use strict';

/**
 * @file environmentGeneratorService.js
 * @description Générateur d'environnements co-évolutifs pour NCE.
 *
 * POET (arXiv:1901.01753) : Environment <-> Agent
 * NCE : Environment <-> Agent <-> ProblemRepresentation
 *
 * Le générateur maintient une population d'environnements de complexité
 * croissante et les couple aux agents capables de les résoudre, avec
 * transfert de compétences entre environnements.
 *
 * Références :
 *  - POET (arXiv:1901.01753) : environnements co-évolutifs
 *  - Quality-Diversity (arXiv:2401.10539) : solutions diverses + performantes
 */

const crypto = require('crypto');

// ─── Types d'environnements ─────────────────────────────────────────

const ENVIRONMENT_ARCHETYPES = {
  'resource_scarcity': {
    label: 'Rareté des ressources',
    baseDifficulty: 0.3,
    difficultyRange: [0.1, 0.9],
    requiredCapabilities: ['foraging', 'allocation'],
    mutationOperators: ['reduce_resources', 'increase_agents', 'add_competition'],
  },
  'coordination_challenge': {
    label: 'Défi de coordination',
    baseDifficulty: 0.4,
    difficultyRange: [0.2, 0.95],
    requiredCapabilities: ['communication', 'consensus'],
    mutationOperators: ['increase_agents', 'add_latency', 'partial_information'],
  },
  'adversarial_pressure': {
    label: 'Pression adversariale',
    baseDifficulty: 0.5,
    difficultyRange: [0.3, 1.0],
    requiredCapabilities: ['defense', 'detection', 'recovery'],
    mutationOperators: ['increase_threats', 'adapt_threats', 'reduce_visibility'],
  },
  'creative_exploration': {
    label: 'Exploration créative',
    baseDifficulty: 0.2,
    difficultyRange: [0.1, 0.8],
    requiredCapabilities: ['play', 'curiosity'],
    mutationOperators: ['add_dimensions', 'novel_constraints', 'open_ended'],
  },
  'optimization_pressure': {
    label: 'Pression d\'optimisation',
    baseDifficulty: 0.6,
    difficultyRange: [0.4, 1.0],
    requiredCapabilities: ['search', 'evaluation'],
    mutationOperators: ['tighten_constraints', 'multi_objective', 'non_stationary'],
  },
};

// ─── Environnement ──────────────────────────────────────────────────

function createEnvironment(archetype, options) {
  options = options || {};
  const id = `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const arch = ENVIRONMENT_ARCHETYPES[archetype] || ENVIRONMENT_ARCHETYPES.coordination_challenge;

  return {
    id,
    archetype,
    label: arch.label,
    difficulty: options.difficulty || arch.baseDifficulty,
    difficultyRange: arch.difficultyRange,
    requiredCapabilities: arch.requiredCapabilities.slice(),
    mutationOperators: arch.mutationOperators.slice(),
    constraints: options.constraints || {},
    state: options.state || {},
    createdAt: new Date().toISOString(),
    generation: options.generation || 0,
    parentId: options.parentId || null,
    stats: {
      solvedCount: 0,
      attemptCount: 0,
      bestAgentId: null,
      bestScore: 0,
    },
  };
}

// ─── Mutation d'environnement ───────────────────────────────────────

function applyMutation(mutated, operator) {
  const handlers = {
    increase_difficulty: applyDifficultyIncrease,
    reduce_resources: applyResourceReduction,
    add_competition: applyCompetitionIncrease,
    add_latency: applyLatencyIncrease,
    partial_information: applyVisibilityReduction,
    increase_threats: applyThreatIncrease,
    adapt_threats: applyThreatAdaptation,
    reduce_visibility: applyObservationNoise,
    add_dimensions: applyDimensionIncrease,
    novel_constraints: applyNovelConstraints,
    open_ended: applyOpenEnded,
    tighten_constraints: applyToleranceReduction,
    multi_objective: applyObjectiveIncrease,
    non_stationary: applyNonStationary,
  };

  const handler = handlers[operator] || applyDifficultyIncrease;
  return handler(mutated);
}

function applyDifficultyIncrease(env) {
  env.difficulty = Math.min(1, env.difficulty + 0.1);
  return env;
}

function applyResourceReduction(env) {
  env.constraints.resourceBudget = (env.constraints.resourceBudget || 100) * 0.8;
  return env;
}

function applyCompetitionIncrease(env) {
  env.constraints.competitorCount = (env.constraints.competitorCount || 0) + 1;
  return env;
}

function applyLatencyIncrease(env) {
  env.constraints.communicationLatency = (env.constraints.communicationLatency || 0) + 100;
  return env;
}

function applyVisibilityReduction(env) {
  env.constraints.visibility = Math.max(0, (env.constraints.visibility || 1) - 0.1);
  return env;
}

function applyThreatIncrease(env) {
  env.constraints.threatCount = (env.constraints.threatCount || 0) + 1;
  return env;
}

function applyThreatAdaptation(env) {
  env.constraints.threatAdaptation = true;
  return env;
}

function applyObservationNoise(env) {
  env.constraints.observationNoise = (env.constraints.observationNoise || 0) + 0.1;
  return env;
}

function applyDimensionIncrease(env) {
  env.constraints.dimensions = (env.constraints.dimensions || 2) + 1;
  return env;
}

function applyNovelConstraints(env) {
  env.constraints.novel = true;
  return env;
}

function applyOpenEnded(env) {
  env.constraints.openEnded = true;
  return env;
}

function applyToleranceReduction(env) {
  env.constraints.tolerance = Math.max(0, (env.constraints.tolerance || 1) - 0.1);
  return env;
}

function applyObjectiveIncrease(env) {
  env.constraints.objectives = (env.constraints.objectives || 1) + 1;
  return env;
}

function applyNonStationary(env) {
  env.constraints.nonStationary = true;
  return env;
}

function mutateEnvironment(env, operator) {
  const mutated = JSON.parse(JSON.stringify(env));
  mutated.id = `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mutated.parentId = env.id;
  mutated.generation = (env.generation || 0) + 1;
  mutated.createdAt = new Date().toISOString();
  mutated.stats = { solvedCount: 0, attemptCount: 0, bestAgentId: null, bestScore: 0 };
  return applyMutation(mutated, operator);
}

// ─── Sélection d'opérateurs de mutation ────────────────────────────

function selectMutationOperator(env) {
  const arch = ENVIRONMENT_ARCHETYPES[env.archetype];
  if (!arch) return 'increase_difficulty';
  const operators = arch.mutationOperators;
  return operators[Math.floor(Math.random() * operators.length)];
}

// ─── Population d'environnements ────────────────────────────────────

function createEnvironmentPopulation(size, archetypes) {
  const population = [];
  archetypes = archetypes || Object.keys(ENVIRONMENT_ARCHETYPES);

  for (let i = 0; i < size; i++) {
    const archetype = archetypes[i % archetypes.length];
    population.push(createEnvironment(archetype, { difficulty: 0.2 + Math.random() * 0.3 }));
  }

  return population;
}

// ─── Évaluation d'un agent sur un environnement ─────────────────────

function evaluateAgentOnEnvironment(agent, env) {
  // Score basé sur les capacités de l'agent vs requis de l'environnement
  let score = 0;
  const required = env.requiredCapabilities || [];

  for (const cap of required) {
    if (agent.capabilities && agent.capabilities.includes(cap)) {
      score += 1;
    }
  }

  const capabilityScore = required.length > 0 ? score / required.length : 0.5;

  // La difficulté ajuste le score
  const difficultyFactor = 1 - env.difficulty * 0.5;

  return {
    capabilityScore,
    difficultyFactor,
    overallScore: capabilityScore * difficultyFactor,
    canSolve: capabilityScore >= 0.6,
  };
}

// ─── Transfert de compétences ───────────────────────────────────────

function computeTransferPotential(envA, envB) {
  // Évalue à quel point une solution pour A peut aider à résoudre B
  const capsA = envA.requiredCapabilities || [];
  const capsB = envB.requiredCapabilities || [];
  const shared = capsA.filter((c) => capsB.includes(c));
  const total = new Set([...capsA, ...capsB]).size;
  return total > 0 ? shared.length / total : 0;
}

// ─── Co-évolution (une génération) ──────────────────────────────────

function coevolveGeneration(agents, environments) {
  const results = [];

  for (const env of environments) {
    // Évaluer chaque agent sur cet environnement
    const evaluations = agents.map((agent) => ({
      agent,
      evaluation: evaluateAgentOnEnvironment(agent, env),
    }));

    // Sélectionner le meilleur agent
    evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    const best = evaluations[0];

    if (best) {
      env.stats.attemptCount += 1;
      if (best.evaluation.canSolve) {
        env.stats.solvedCount += 1;
        env.stats.bestAgentId = best.agent.id;
        env.stats.bestScore = best.evaluation.overallScore;
      }
    }

    results.push({ environment: env, bestAgent: best ? best.agent : null, evaluations });
  }

  return results;
}

// ─── Mutation de la population ──────────────────────────────────────

function mutatePopulation(environments, targetSize) {
  const mutated = [...environments];

  while (mutated.length < targetSize) {
    const parent = environments[Math.floor(Math.random() * environments.length)];
    const operator = selectMutationOperator(parent);
    const child = mutateEnvironment(parent, operator);
    mutated.push(child);
  }

  return mutated;
}

// ─── Courbe de difficulté (curriculum) ──────────────────────────────

function generateCurriculum(steps, archetype) {
  const curriculum = [];
  const startDifficulty = 0.2;
  const endDifficulty = 0.9;

  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const difficulty = startDifficulty + (endDifficulty - startDifficulty) * t;
    const env = createEnvironment(archetype || 'creative_exploration', {
      difficulty,
      generation: i,
    });
    curriculum.push(env);
  }

  return curriculum;
}

module.exports = {
  ENVIRONMENT_ARCHETYPES,
  createEnvironment,
  mutateEnvironment,
  selectMutationOperator,
  createEnvironmentPopulation,
  evaluateAgentOnEnvironment,
  computeTransferPotential,
  coevolveGeneration,
  mutatePopulation,
  generateCurriculum,
};

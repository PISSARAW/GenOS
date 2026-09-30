'use strict';

/**
 * @file phenotypicDevelopmentService.js
 * @description Service de développement phénotypique dynamique.
 *
 * Le phénotype d'un agent n'est pas statique : il se développe en réponse
 * à l'environnement, comme une plante développe ses racines vers les
 * ressources et atrophie les branches inutilisées.
 *
 * Structure du phénotype développé :
 *  - genome : ADN de base (immuable)
 *  - phenotype : expression actuelle (dynamique)
 *  - branches : spécialisations actives
 *  - atrophies : branches inutilisées (prêtes à être réactivées)
 *  - history : historique de développement
 *
 * Références :
 *  - Plant Phenotypic Plasticity (Annual Reviews, 2026)
 *  - Root Growth and Development (Annual Reviews, 2025)
 */

const { express } = require('./agentDna/express');
const { getDatabase } = require('../db');

// ─── Développement phénotypique ─────────────────────────────────────

function createPhenotypeState(genome) {
  const basePhenotype = express(genome);

  return {
    genomeId: genome.meta.name,
    basePhenotype: basePhenotype,
    currentPhenotype: { ...basePhenotype },
    branches: [],
    atrophies: [],
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Croissance de branche ──────────────────────────────────────────

function growBranch(state, branchType, options) {
  options = options || {};
  const branch = {
    id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: branchType,
    name: options.name || branchType,
    tools: options.tools || [],
    capabilities: options.capabilities || [],
    strength: options.strength || 0.5,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 0,
    active: true,
  };

  state.branches.push(branch);
  state.history.push({
    action: 'grow',
    branchId: branch.id,
    branchType,
    timestamp: new Date().toISOString(),
  });
  state.updatedAt = new Date().toISOString();

  return branch;
}

// ─── Atrophie de branche ────────────────────────────────────────────

function atrophyBranch(state, branchId) {
  const branch = state.branches.find((b) => b.id === branchId);
  if (!branch) return null;

  branch.active = false;
  branch.atrophiedAt = new Date().toISOString();
  state.atrophies.push(branch);
  state.branches = state.branches.filter((b) => b.id !== branchId);

  state.history.push({
    action: 'atrophy',
    branchId,
    branchType: branch.type,
    timestamp: new Date().toISOString(),
  });
  state.updatedAt = new Date().toISOString();

  return branch;
}

// ─── Réactivation de branche ────────────────────────────────────────

function reactivateBranch(state, branchId) {
  const branch = state.atrophies.find((b) => b.id === branchId);
  if (!branch) return null;

  branch.active = true;
  branch.reactivatedAt = new Date().toISOString();
  state.branches.push(branch);
  state.atrophies = state.atrophies.filter((b) => b.id !== branchId);

  state.history.push({
    action: 'reactivate',
    branchId,
    branchType: branch.type,
    timestamp: new Date().toISOString(),
  });
  state.updatedAt = new Date().toISOString();

  return branch;
}

// ─── Utilisation de branche ─────────────────────────────────────────

function useBranch(state, branchId) {
  const branch = state.branches.find((b) => b.id === branchId);
  if (!branch) return null;

  branch.useCount += 1;
  branch.lastUsedAt = new Date().toISOString();
  branch.strength = Math.min(1, branch.strength + 0.05);

  return branch;
}

// ─── Développement basé sur l'environnement ─────────────────────────

function developFromEnvironment(state, environment) {
  const actions = [];

  // Identifier les besoins non satisfaits
  const needs = identifyNeeds(state, environment);

  for (const need of needs) {
    // Vérifier si une branche existante peut satisfaire le besoin
    const existing = findSatisfyingBranch(state, need);

    if (existing) {
      // Renforcer la branche existante
      existing.strength = Math.min(1, existing.strength + 0.1);
      existing.lastUsedAt = new Date().toISOString();
      actions.push({ action: 'strengthen', branchId: existing.id, need: need.type });
    } else {
      // Créer une nouvelle branche
      const branch = growBranch(state, need.type, {
        name: need.name,
        tools: need.tools || [],
        capabilities: need.capabilities || [],
        strength: 0.3,
      });
      actions.push({ action: 'grow', branchId: branch.id, need: need.type });
    }
  }

  // Atrophier les branches inutilisées depuis trop longtemps
  const now = Date.now();
  const atrophyThreshold = 7 * 24 * 60 * 60 * 1000; // 7 jours

  for (const branch of [...state.branches]) {
    const lastUsed = new Date(branch.lastUsedAt).getTime();
    if (now - lastUsed > atrophyThreshold && branch.strength < 0.3) {
      atrophyBranch(state, branch.id);
      actions.push({ action: 'atrophy', branchId: branch.id, reason: 'unused' });
    }
  }

  return actions;
}

// ─── Identification des besoins ─────────────────────────────────────

function identifyNeeds(state, environment) {
  const needs = [];

  // Besoin d'outils manquants
  if (environment.requiredTools) {
    for (const tool of environment.requiredTools) {
      const hasTool = state.branches.some((b) => b.tools.includes(tool));
      if (!hasTool) {
        needs.push({
          type: 'tool',
          name: tool,
          tools: [tool],
          capabilities: [],
        });
      }
    }
  }

  // Besoin de capacités manquantes
  if (environment.requiredCapabilities) {
    for (const cap of environment.requiredCapabilities) {
      const hasCap = state.branches.some((b) => b.capabilities.includes(cap));
      if (!hasCap) {
        needs.push({
          type: 'capability',
          name: cap,
          tools: [],
          capabilities: [cap],
        });
      }
    }
  }

  return needs;
}

// ─── Recherche de branche satisfaisante ─────────────────────────────

function findSatisfyingBranch(state, need) {
  for (const branch of state.branches) {
    if (!branch.active) continue;

    if (need.type === 'tool') {
      const hasAllTools = need.tools.every((t) => branch.tools.includes(t));
      if (hasAllTools) return branch;
    }

    if (need.type === 'capability') {
      const hasAllCaps = need.capabilities.every((c) => branch.capabilities.includes(c));
      if (hasAllCaps) return branch;
    }
  }

  return null;
}

// ─── Métriques de développement ─────────────────────────────────────

function getDevelopmentMetrics(state) {
  const activeBranches = state.branches.filter((b) => b.active);
  const totalUses = activeBranches.reduce((sum, b) => sum + b.useCount, 0);
  const avgStrength = activeBranches.length > 0
    ? activeBranches.reduce((sum, b) => sum + b.strength, 0) / activeBranches.length
    : 0;

  return {
    totalBranches: state.branches.length,
    activeBranches: activeBranches.length,
    atrophiedBranches: state.atrophies.length,
    totalUses,
    avgStrength,
    historyLength: state.history.length,
  };
}

// ─── Persistance ────────────────────────────────────────────────────

async function savePhenotypeState(state) {
  const db = await getDatabase();
  const id = `pheno_${state.genomeId}_${Date.now()}`;

  await db.run(
    `INSERT INTO agent_phenotype_states (id, genome_id, state_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    id,
    state.genomeId,
    JSON.stringify(state),
    state.createdAt,
    state.updatedAt
  );

  return id;
}

async function loadPhenotypeState(genomeId) {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT state_json FROM agent_phenotype_states WHERE genome_id = ? ORDER BY updated_at DESC LIMIT 1',
    genomeId
  );

  return row ? JSON.parse(row.state_json) : null;
}

module.exports = {
  createPhenotypeState,
  growBranch,
  atrophyBranch,
  reactivateBranch,
  useBranch,
  developFromEnvironment,
  identifyNeeds,
  findSatisfyingBranch,
  getDevelopmentMetrics,
  savePhenotypeState,
  loadPhenotypeState,
};

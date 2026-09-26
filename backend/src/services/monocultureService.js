'use strict';

/**
 * Pathologie COGNITIVE_MONOCULTURE (diagnostic + traitement, jamais un état).
 *
 * Symptômes mesurés : consensus total des issues récentes, parenté des rôles
 * dispatchés (mêmes priors), erreurs corrélées (même garde-fou dominant).
 * Traitements proposés en données (introduce_stranger, resurrect_fossil,
 * cross_distant_lineages, spawn_adversary, increase_mutation,
 * open_isolated_world, inject_cultural_artifact, create_chimera) — jamais
 * appliqués ici : l'orchestrateur décide. Joint au plan en audit.
 */

const RECENT_RUNS = 10;

const TREATMENTS = {
  consensus: ['spawn_adversary', 'introduce_stranger'],
  kinship: ['cross_distant_lineages', 'introduce_stranger'],
  errorCorrelation: ['resurrect_fossil', 'open_isolated_world']
};

async function recentRuns(db, agentId) {
  const rows = await db.all(
    `SELECT status, guardrail_reason FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ${RECENT_RUNS}`,
    agentId
  );
  return Array.isArray(rows) ? rows : [];
}

function consensusSymptom(runs) {
  if (runs.length < 3) return null;
  const statuses = new Set(runs.map((row) => String(row.status)));
  if (statuses.size === 1) return { symptom: 'consensus', detail: `unanimous ${runs[0].status} x${runs.length}` };
  return null;
}

function kinshipSymptom(plan) {
  const roles = ((plan && plan.dispatchWorkers) || []).map((worker) => worker.role).filter(Boolean);
  if (roles.length < 2) return null;
  const unique = new Set(roles).size;
  if (unique / roles.length < 0.5) return { symptom: 'kinship', detail: `${unique}/${roles.length} distinct roles` };
  return null;
}

function errorCorrelationSymptom(runs) {
  const reasons = runs.map((row) => row.guardrail_reason).filter(Boolean);
  if (reasons.length < 3) return null;
  const counts = {};
  for (const reason of reasons) counts[reason] = (counts[reason] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top[1] / reasons.length >= 0.7) return { symptom: 'errorCorrelation', detail: `${top[0]} x${top[1]}/${reasons.length}` };
  return null;
}

async function diagnose(input) {
  const options = input || {};
  const symptoms = [];
  if (!options.db || !options.agentId) return { afflicted: false, symptoms, treatments: [] };
  try {
    const runs = await recentRuns(options.db, options.agentId);
    for (const check of [consensusSymptom(runs), kinshipSymptom(options.plan), errorCorrelationSymptom(runs)]) {
      if (check) symptoms.push(check);
    }
    const treatments = [...new Set(symptoms.flatMap((item) => TREATMENTS[item.symptom] || []))];
    return { afflicted: symptoms.length > 0, symptoms, treatments };
  } catch (_) {
    return { afflicted: false, symptoms: [], treatments: [] };
  }
}

module.exports = { diagnose };

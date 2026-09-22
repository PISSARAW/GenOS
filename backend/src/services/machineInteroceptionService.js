'use strict';

/**
 * Machine Interoception — l'agent RESSENT sa machine au lieu de recevoir
 * des valeurs arbitraires de l'appelant.
 *
 * Architecture (audit P1) :
 *
 *   Runtime (telemetry_events, agents, episodic_memories...)
 *        │
 *        ▼
 *   MachineInteroception   ← ce module
 *        │
 *        ▼
 *   Homeostasis (organismHomeostasisService)
 *
 * Chaque variable est DÉRIVÉE de mesures réelles, jamais fournie :
 *   - energy            ← flux d'inférences réussies vs échecs (fenêtre glissante)
 *   - memory_pressure   ← volume d'épisodes non consolidés / capacité
 *   - social_state      ← signaux sociaux reçus vs émis (stigmergie)
 *   - model_drift       ← latence/dérive des réponses LLM récentes
 *   - context_pressure  ← tokens cumulés des sessions actives / budget
 *   - integrity         ← erreurs critiques + quarantaines récentes
 *   - stress            ← événements warning+error récents (fenêtre courte)
 *
 * Niveau 2 (biomimétique dérivé, jamais l'inverse) : BiologicalAnalogy.
 */

const crypto = require('crypto');

const WINDOW_RECENT_MS = 30 * 60 * 1000;   // 30 min
const WINDOW_STRESS_MS = 10 * 60 * 1000;   // 10 min
const MAX_EXPECTED_EPISODES = 500;

/**
 * Requêtes SQL brutes sur la télémétrie réelle — une par variable.
 */
async function sampleRuntime(db, agentId, now) {
  const recent = new Date(now - WINDOW_RECENT_MS).toISOString();
  const stressWindow = new Date(now - WINDOW_STRESS_MS).toISOString();

  const [inference, episodes, social, integrity, stress, context] = await Promise.all([
    db.get(
      `SELECT
         SUM(CASE WHEN event_type = 'INFERENCE_COMPLETED' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN event_type = 'INFERENCE_STARTED' THEN 1 ELSE 0 END) as started,
         SUM(CASE WHEN event_type = 'MODEL_ROUTE_FAILED' THEN 1 ELSE 0 END) as route_failed
       FROM telemetry_events
       WHERE agent_id = ? AND created_at >= ?`,
      agentId, recent
    ),
    db.get(
      `SELECT COUNT(*) as unconsolidated FROM episodic_memories
       WHERE agent_id = ? AND is_consolidated = 0 AND is_purged = 0`,
      agentId
    ),
    db.get(
      `SELECT
         SUM(CASE WHEN event_type IN ('WORKER_REGISTERED','AGENT_COMPLETED') THEN 1 ELSE 0 END) as social_in,
         SUM(CASE WHEN event_type = 'AGENT_STEP' THEN 1 ELSE 0 END) as social_out
       FROM telemetry_events
       WHERE agent_id = ? AND created_at >= ?`,
      agentId, recent
    ),
    db.get(
      `SELECT COUNT(*) as critical FROM telemetry_events
       WHERE agent_id = ? AND severity IN ('critical','error') AND created_at >= ?`,
      agentId, recent
    ),
    db.get(
      `SELECT COUNT(*) as stress_events FROM telemetry_events
       WHERE agent_id = ? AND severity IN ('warning','error','critical') AND created_at >= ?`,
      agentId, stressWindow
    ),
    db.get(
      `SELECT COUNT(*) as active_sessions FROM (
         SELECT session_id FROM telemetry_events
         WHERE agent_id = ? AND created_at >= ? AND session_id IS NOT NULL
         GROUP BY session_id
       )`,
      agentId, recent
    )
  ]);

  return { inference, episodes, social, integrity, stress, context };
}

/**
 * Dérive les 7 variables homeostatiques à partir de l'échantillon runtime.
 * Chaque formule est une heuristique EXPLICITE et testable, pas une magie.
 */
function deriveHomeostaticVariables(sample) {
  const { inference, episodes, social, integrity, stress, context } = sample;
  const attempted = Math.max(inference?.started || 0, inference?.route_failed || 0);

  return {
    energy: deriveEnergy(inference, attempted),
    memory_pressure: deriveMemoryPressure(episodes),
    social_state: deriveSocialState(social),
    model_drift: deriveModelDrift(inference, attempted),
    context_pressure: deriveContextPressure(context),
    integrity: deriveIntegrity(integrity),
    stress: deriveStress(stress)
  };
}

function deriveEnergy(inference, attempted) {
  // Inferences complétées / démarrées.
  // Sans activité mesurée → neutre (0.5), pas « énergie nulle » :
  // l'absence de données n'est pas une défaillance.
  if (attempted === 0) return 0.5;
  const completed = inference?.completed || 0;
  return clamp01(completed / attempted);
}

function deriveMemoryPressure(episodes) {
  // Épisodes non consolidés / capacité attendue.
  const unconsolidated = episodes?.unconsolidated || 0;
  return clamp01(unconsolidated / MAX_EXPECTED_EPISODES);
}

function deriveSocialState(social) {
  // Signaux reçus vs émis (1 = équilibre, 0 = isolé).
  const socialIn = social?.social_in || 0;
  const socialOut = social?.social_out || 0;
  if (socialIn + socialOut === 0) return 0.5;
  return clamp01((socialIn / Math.max(socialIn + socialOut, 1)) * 2);
}

function deriveModelDrift(inference, attempted) {
  // Échecs de routage / tentatives récentes.
  if (attempted === 0) return 0;
  const routeFailed = inference?.route_failed || 0;
  return clamp01(routeFailed / attempted);
}

function deriveContextPressure(context) {
  // Sessions actives récentes (proxy de fenêtres ouvertes).
  const activeSessions = context?.active_sessions || 0;
  return clamp01(activeSessions / 10);
}

function deriveIntegrity(integrity) {
  // 1 - densité d'événements critiques (fenêtre 30 min).
  const critical = integrity?.critical || 0;
  return clamp01(1 - critical / 20);
}

function deriveStress(stress) {
  // Événements warning+ récents (fenêtre 10 min).
  const stressEvents = stress?.stress_events || 0;
  return clamp01(stressEvents / 30);
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Niveau biomimétique dérivé — interprétation biologique de la réalité
 * machine, EXPLICITEMENT secondaire (jamais utilisée pour décider).
 */
function deriveBiologicalAnalogy(variables) {
  return {
    cortisol_like: variables.stress,
    dopamine_like: variables.energy * (1 - variables.stress),
    adenosine_like: variables.context_pressure,
    note: 'Interprétation biomimétique dérivée — jamais une entrée de décision.'
  };
}

/**
 * Interoception complète : échantillonne le runtime et dérive l'état.
 * Retourne { variables, biologicalAnalogy, sources, sampledAt }.
 */
async function senseAgentRuntime(db, agentId, options = {}) {
  if (!db || !agentId) {
    throw new Error('senseAgentRuntime requires db and agentId');
  }
  const now = options.now || Date.now();
  const sample = await sampleRuntime(db, agentId, now);
  const variables = deriveHomeostaticVariables(sample);
  const biologicalAnalogy = deriveBiologicalAnalogy(variables);

  return {
    agentId,
    variables,
    biologicalAnalogy,
    sources: {
      telemetry: 'telemetry_events',
      memory: 'episodic_memories',
      windowRecentMs: WINDOW_RECENT_MS,
      windowStressMs: WINDOW_STRESS_MS
    },
    sampledAt: new Date(now).toISOString()
  };
}

/**
 * Pont vers l'homéostasie : évalue l'état SANS valeurs fournies.
 * C'est le point d'entrée canonical de la régulation agentique.
 */
async function evaluateHomeostasisFromRuntime(db, agentId, homeostasisService) {
  const sensing = await senseAgentRuntime(db, agentId);
  const evaluation = await homeostasisService.evaluateAgentHomeostasis(db, agentId, {
    energy: sensing.variables.energy,
    memoryPressure: sensing.variables.memory_pressure,
    socialState: sensing.variables.social_state,
    modelDrift: sensing.variables.model_drift,
    contextPressure: sensing.variables.context_pressure,
    integrity: sensing.variables.integrity,
    stress: sensing.variables.stress
  });
  return { sensing, evaluation };
}

module.exports = {
  senseAgentRuntime,
  evaluateHomeostasisFromRuntime,
  deriveHomeostaticVariables,
  deriveBiologicalAnalogy,
  sampleRuntime,
  WINDOW_RECENT_MS,
  WINDOW_STRESS_MS
};

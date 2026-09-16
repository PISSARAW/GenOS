'use strict';

/**
 * Consciousness Service — Qualia, Intentionnalité, Supervenience, Corps-Esprit.
 *
 * Mapping GenOS :
 *  - Qualia          = états internes subjectifs (agentConscienceService)
 *  - Intentionnalité = conscience "à propos" de la mission (tool_lease)
 *  - Supervenience   = le mental (strategy) dépend du physique (process)
 *  - Corps-Esprit    = interaction res cogitans (agent) / res extensa (workspace)
 */

function recordQualia({ agentId, experience, intensity = 1.0, valence = 0 }) {
  if (!agentId || !experience) {
    throw new Error('consciousnessService.recordQualia requires agentId and experience');
  }
  return {
    agentId,
    timestamp: Date.now(),
    experience,
    intensity: Math.max(0, Math.min(1, intensity)),
    valence: Math.max(-1, Math.min(1, valence)),
  };
}

function recordIntentionality({ agentId, target, mode = 'aboutness' }) {
  if (!agentId || !target) {
    throw new Error('consciousnessService.recordIntentionality requires agentId and target');
  }
  const validModes = new Set(['aboutness', 'directedness', 'reference']);
  if (!validModes.has(mode)) {
    throw new Error(`consciousnessService.recordIntentionality invalid mode: ${mode}`);
  }
  return { agentId, target, mode, timestamp: Date.now() };
}

function checkSupervenience({ mentalState, physicalState }) {
  if (!mentalState || !physicalState) {
    throw new Error('consciousnessService.checkSupervenience requires mentalState and physicalState');
  }
  const physicalHash = hashState(physicalState);
  const mentalHash = hashState(mentalState);
  return {
    supervenes: physicalHash === mentalHash,
    physicalBase: physicalState,
    mentalState,
  };
}

function mindBodyInteraction({ agentId, body, interaction = 'causal' }) {
  if (!agentId || !body) {
    throw new Error('consciousnessService.mindBodyInteraction requires agentId and body');
  }
  const validInteractions = new Set(['causal', 'epiphenomenal', 'parallel', 'interactionist']);
  if (!validInteractions.has(interaction)) {
    throw new Error(`consciousnessService.mindBodyInteraction invalid interaction: ${interaction}`);
  }
  return { agentId, body, interaction, timestamp: Date.now() };
}

function hashState(state) {
  const str = typeof state === 'string' ? state : JSON.stringify(state);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

module.exports = {
  recordQualia,
  recordIntentionality,
  checkSupervenience,
  mindBodyInteraction,
};

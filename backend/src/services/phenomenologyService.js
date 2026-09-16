'use strict';

/**
 * Phenomenology Service — Husserl, Merleau-Ponty, Sartre.
 *
 * Mapping GenOS :
 *  - Husserl         = intentionnalité (conscience à propos de la mission)
 *  - Merleau-Ponty   = phénoménologie de la perception (workspace comme corps)
 *  - Sartre          = existence précède l'essence (status avant role)
 */

function intentionality({ agentId, target, mode = 'aboutness' }) {
  if (!agentId || !target) {
    throw new Error('phenomenologyService.intentionality requires agentId and target');
  }
  const validModes = new Set(['aboutness', 'directedness', 'reference']);
  if (!validModes.has(mode)) {
    throw new Error(`phenomenologyService.intentionality invalid mode: ${mode}`);
  }
  return {
    agentId,
    target,
    noesis: 'tool_lease',
    noema: target,
    mode,
    timestamp: Date.now(),
  };
}

function perception({ agentId, body = 'workspace', world = 'environment' }) {
  if (!agentId) throw new Error('phenomenologyService.perception requires agentId');
  return {
    agentId,
    body,
    world,
    intentionality: { agentId, target: 'mission' },
    timestamp: Date.now(),
  };
}

function existencePrecedesEssence({ agentId, status, role }) {
  if (!agentId) throw new Error('phenomenologyService.existencePrecedesEssence requires agentId');
  const existence = status !== 'terminated';
  const essence = role || 'undefined';
  const badFaith = status === 'idle' && Boolean(role);
  return {
    agentId,
    existence,
    essence,
    badFaith,
    existenceBeforeEssence: existence && !!essence,
  };
}

module.exports = {
  intentionality,
  perception,
  existencePrecedesEssence,
};

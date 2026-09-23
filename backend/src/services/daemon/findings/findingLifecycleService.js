'use strict';

/**
 * Finding Lifecycle — ADR 0034 D6.
 *
 * Statut jamais choisi par LLM seul : transitions fermées et
 * déterministes. REFUTED et EXPIRED sont terminaux — un finding
 * réfuté reste réfuté (invariant Phase 35). STALE est la sortie
 * commit-aware (HEAD bougé) avec un seul chemin de retour :
 * re-hypothèse explicite sur le nouveau HEAD.
 */

const TRANSITIONS = {
  OBSERVED: ['HYPOTHESIZED', 'REFUTED', 'STALE', 'EXPIRED'],
  HYPOTHESIZED: ['SUPPORTED', 'REFUTED', 'STALE', 'EXPIRED'],
  SUPPORTED: ['REPRODUCED', 'REFUTED', 'STALE', 'EXPIRED'],
  REPRODUCED: ['CAUSALLY_SUPPORTED', 'STALE', 'EXPIRED'],
  CAUSALLY_SUPPORTED: ['REPAIRABLE', 'STALE', 'EXPIRED'],
  REPAIRABLE: ['EXPIRED'],
  STALE: ['HYPOTHESIZED', 'EXPIRED'],
  REFUTED: [],
  EXPIRED: []
};

const TERMINAL = ['REFUTED', 'EXPIRED'];
const INITIAL = ['OBSERVED', 'HYPOTHESIZED'];

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function isTerminal(status) {
  return TERMINAL.includes(status);
}

function isInitial(status) {
  return INITIAL.includes(status);
}

async function onPostTransition(db, finding, toStatus) {
  if (toStatus !== 'REPAIRABLE') return null;
  if (!db || !finding || !finding.id) return null;
  const repair = require('../repair/repairEpisodeService');
  return repair.openEpisode(db, {
    findingId: finding.id,
    createdBy: finding.createdBy || 'daemon.resident'
  });
}

module.exports = { TRANSITIONS, TERMINAL, INITIAL, canTransition, isTerminal, isInitial, onPostTransition };

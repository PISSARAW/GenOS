'use strict';

/**
 * @file axolotlTopologyService.js
 * @description Extension de la topologie biologique pour le mode plastique axolotl.
 *
 * Deux modes d'organisation topologique :
 * - plastique : la topologie peut changer à tout moment (état larvaire axolotl)
 * - stabilisé : la topologie est figée (état adulte)
 *
 * La transition entre les deux modes est délibérée (pas automatique).
 *
 * NB : pas de require vers biologicalTopologyService ici (dépendance
 * circulaire volontairement évitée : biologicalTopologyService compose
 * l'axolotl, pas l'inverse).
 */

// État interne : mode actuel par orchestrateur — perdu au redémarrage
const topologyModes = new Map();

/**
 * Définir le mode topologique pour un orchestrateur.
 * @param {string} orchestratorId - identifiant de l'orchestrateur
 * @param {'plastique'|'stabilisé'} mode - mode souhaité
 * @returns {object} état du mode
 */
function setTopologyMode(orchestratorId, mode) {
  const normalized = String(mode || 'plastique').toLowerCase().trim();
  const resolved = (normalized === 'stabilisé' || normalized === 'stable') ? 'stabilisé' : 'plastique';
  topologyModes.set(orchestratorId, { mode: resolved, setAt: new Date().toISOString() });
  return getTopologyMode(orchestratorId);
}

/**
 * Récupérer le mode topologique actuel.
 * @param {string} orchestratorId
 * @returns {object|null} mode actuel ou null
 */
function getTopologyMode(orchestratorId) {
  const entry = topologyModes.get(orchestratorId);
  if (!entry) {
    // Par défaut : plastique (état larvaire par défaut = axolotl)
    return { mode: 'plastique', setAt: null, defaulted: true };
  }
  return { ...entry, defaulted: false };
}

/**
 * Vérifier si l'orchestrateur est en mode plastique.
 */
function isPlastique(orchestratorId) {
  const mode = getTopologyMode(orchestratorId);
  return mode.mode === 'plastique';
}

/**
 * Vérifier si l'orchestrateur est en mode stabilisé.
 */
function isStabilise(orchestratorId) {
  const mode = getTopologyMode(orchestratorId);
  return mode.mode === 'stabilisé';
}

/**
 * Appliquer une organisation dans le mode actuel.
 * En mode plastique, la topologie peut être réorganisée librement.
 * En mode stabilisé, la réorganisation doit passer par les mécanismes classiques.
 *
 * @param {object} input - { db, orchestratorId, organization, reason }
 */
async function applyOrganizationMode(input = {}) {
  const { db, orchestratorId, organization, reason } = input;
  if (!organization) return;

  const modeEntry = getTopologyMode(orchestratorId);

  if (modeEntry.mode === 'stabilisé') {
    // En mode stabilisé : organisation par le mécanisme classique
    const dynamicOrganization = require('./dynamicOrganizationService');
    await dynamicOrganization.changeOrganization(db, {
      orchestratorId,
      organization,
      reason: reason || `Changement organisationnel en mode stabilisé`,
      changedBy: orchestratorId
    }).catch(() => {});
  } else {
    // En mode plastique : application libre avec trace
    const dynamicOrganization = require('./dynamicOrganizationService');
    await dynamicOrganization.changeOrganization(db, {
      orchestratorId,
      organization,
      reason: reason || `Réorganisation plastique (axolotl mode)`,
      changedBy: orchestratorId
    }).catch(() => {});
  }
}

/**
 * Transitionner vers le mode stabilisé.
 * Utilisé quand le contexte justifie la stabilité (problème résolu, production stable).
 */
function transitionToStabilise(orchestratorId, reason) {
  const before = getTopologyMode(orchestratorId);
  setTopologyMode(orchestratorId, 'stabilisé');
  return {
    from: before.mode,
    to: 'stabilisé',
    reason: reason || 'Transition vers stabilité',
    at: new Date().toISOString()
  };
}

/**
 * Transitionner vers le mode plastique.
 * Utilisé quand une nouvelle menace ou opportunité nécessite la reconfiguration.
 */
function transitionToPlastique(orchestratorId, reason) {
  const before = getTopologyMode(orchestratorId);
  setTopologyMode(orchestratorId, 'plastique');
  return {
    from: before.mode,
    to: 'plastique',
    reason: reason || 'Transition vers plasticité (axolotl mode)',
    at: new Date().toISOString()
  };
}

/**
 * Lister tous les modes connus.
 */
function listTopologyModes() {
  const result = [];
  for (const [orchestratorId, entry] of topologyModes) {
    result.push({ orchestratorId, ...entry });
  }
  return result;
}

/**
 * Réinitialiser le mode à la valeur par défaut (plastique).
 */
function resetToDefault(orchestratorId) {
  topologyModes.delete(orchestratorId);
  return getTopologyMode(orchestratorId);
}

module.exports = {
  setTopologyMode,
  getTopologyMode,
  isPlastique,
  isStabilise,
  applyOrganizationMode,
  transitionToStabilise,
  transitionToPlastique,
  listTopologyModes,
  resetToDefault
};

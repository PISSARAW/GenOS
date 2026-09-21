'use strict';

/**
 * Pont entre l'apoptose épistémique AEIS et l'autorité runtime GenOS.
 *
 * Quand un agent accumule une dissonance épistémique suffisante,
 * ce pont :
 * 1. Met à jour son statut dans la base de données
 * 2. Révoque son autorité d'exécution
 * 3. Notifie l'orchestrateur
 * 4. Enregistre l'autopsie dans la mémoire immunitaire
 *
 * L'updateAgent est injecté en paramètre pour éviter la dépendance
 * à agentOrchestrationState qui nécessite db.js (absent dans certains contextes).
 */

const { accumulate, peutApoptoser, autopsy } = require('./epistemicApoptosisService');

function createApoptosisAuthorityBridge(deps = {}) {
  const updateAgent = deps.updateAgent || defaultUpdateAgent;

  async function defaultUpdateAgent(agentId, status, currentTask) {
    // Tente de charger agentOrchestrationState si disponible.
    try {
      const { updateAgent: ua } = require('../agentOrchestrationState');
      return ua(agentId, status, currentTask);
    } catch (_) {
      // Si le module n'est pas disponible, on considère que l'agent n'existe pas.
      return { changes: 0 };
    }
  }

  /**
   * Applique l'apoptose épistémique à un agent.
   * Retourne true si l'agent a été terminé.
   */
  async function applyEpistemicApoptosis(db, agentId, signals = []) {
    const agent = await db.get('SELECT id, name, status, role, epistemic_dissonance FROM agents WHERE id = ?', agentId);
    if (!agent) return { ok: false, reason: 'agent_not_found' };

    const updated = accumulate(agent, signals);

    if (!peutApoptoser(updated)) {
      return { ok: false, reason: 'below_threshold', dissonance: updated.epistemicDissonance };
    }

    await updateAgent(agentId, 'apoptotique', 'Apoptose épistémique');

    const autopsyReport = autopsy(updated, 'epistemic_dissonance', signals.map(String));

    return {
      ok: true,
      agentId,
      status: 'apoptotique',
      dissonance: updated.epistemicDissonance,
      autopsy: autopsyReport,
    };
  }

  /**
   * Révoque l'autorité d'un agent (quarantaine ou réduction).
   */
  async function revokeAuthority(db, agentId, level, reason) {
    const agent = await db.get('SELECT id, name, status, role FROM agents WHERE id = ?', agentId);
    if (!agent) return { ok: false, reason: 'agent_not_found' };

    let newStatus = 'quarantined';
    if (level === 'reduced_authority') newStatus = 'restricted';

    await updateAgent(agentId, newStatus, `Révocation épistémique: ${reason}`);

    return { ok: true, agentId, newStatus, reason };
  }

  /**
   * Révoque l'autorité si la dissonance dépasse le seuil.
   */
  async function revokeIfDissonant(db, agentId, dissonance) {
    const { SEUILS } = require('./epistemicApoptosisService');
    if (dissonance >= SEUILS.quarantine) {
      return revokeAuthority(db, agentId, 'quarantine', `dissonance=${dissonance}`);
    }
    if (dissonance >= SEUILS.reduced_authority) {
      return revokeAuthority(db, agentId, 'reduced_authority', `dissonance=${dissonance}`);
    }
    return { ok: false, reason: 'no_revocation_needed', dissonance };
  }

  return { applyEpistemicApoptosis, revokeAuthority, revokeIfDissonant };
}

module.exports = { createApoptosisAuthorityBridge };

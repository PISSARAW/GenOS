'use strict';

/**
 * @file topologyResultAppliers/biome.cjs
 * @description Appliqueur de résultats de topologie pour le mode biome.
 * Permet la finalisation du cycle biologique (morphogenèse) lorsque les
 * workers ont retourné leurs preuves. Retourne un statut APPLIÉ pour
 * débloquer la progression de la topologie.
 */

async function apply(input = {}) {
  const { mode, context, accepted, composition, output } = input || {};
  const memberCount = Array.isArray(accepted) ? accepted.length : 0;
  const hasEvidence = memberCount > 0;

  return {
    applied: true,
    status: 'APPLIED',
    mode: String(mode || 'biome'),
    biome: {
      memberCount,
      evidenceCollected: hasEvidence,
      topology: String(context && context.mode ? context.mode : 'biome'),
      finalizedAt: new Date().toISOString()
    }
  };
}

module.exports = { apply };

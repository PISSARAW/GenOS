'use strict';

/**
 * Variant speculative — projection hors-ligne / what-if pour le runtime Syncytium.
 *
 * Ce variant n'est pas encore implémenté (travail en cours, commit f2e95f30).
 * Stub minimal pour débloquer le chargement du variantFacade sans rupture
 * de la chaîne d'importation.
 */
function createSpeculativeVariantService(syncytium) {
  return {
    /**
     * Projette un état alternatif sans muter la session — non implémenté.
     */
    speculate: (sessionId, scenario, options) => {
      const err = new Error('SpeculativeVariantNotImplemented: speculate() est un stub');
      err.code = 'SPECULATIVE_NOT_IMPLEMENTED';
      throw err;
    },

    /**
     * Valide un scénario conjectural contre le schéma de la session — non implémenté.
     */
    validateScenario: (sessionId, scenario, options) => {
      const err = new Error('SpeculativeVariantNotImplemented: validateScenario() est un stub');
      err.code = 'SPECULATIVE_NOT_IMPLEMENTED';
      throw err;
    }
  };
}

module.exports = { createSpeculativeVariantService };

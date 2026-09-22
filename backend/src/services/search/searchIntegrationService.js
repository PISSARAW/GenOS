/**
 * Search Integration — Branche les modules isolés au pipeline Natural Search.
 *
 * Centralise :
 *   - CognitiveAffinityService (variants + sélection par ledger)
 *   - NegativeSearchMemoryService (échecs persistants + blocage)
 *   - SearchCultureService (plasmides validés)
 */

const { createClones, createVariants, selectBestVariant } = require('./cognitiveAffinityService');
const { NegativeSearchMemory } = require('./negativeSearchMemoryService');
const { SearchCultureService } = require('./searchCultureService');

class SearchIntegration {
  constructor(options = {}) {
    this.negativeMemory = options.negativeMemory || new NegativeSearchMemory();
    this.culture = options.culture || new SearchCultureService();
    this.affinity = { createClones, createVariants, selectBestVariant };
  }

  /**
   * Créer des variants pour CLONAL_AFFINITY_SEARCH via CognitiveAffinity.
   * Retourne le meilleur variant selon le ledger.
   */
  createAffinityVariants(baseGenome, ledger, agentId) {
    const variants = this.affinity.createVariants(baseGenome, 4, 'minimal');
    const best = this.affinity.selectBestVariant(variants, ledger, agentId);
    return { variants, best };
  }

  /**
   * Enregistrer un échec dans la mémoire négative.
   */
  recordNegative(agentId, hypothesis, evidence, environment) {
    return this.negativeMemory.recordFailure(agentId, hypothesis, evidence, environment);
  }

  /**
   * Vérifier si un chemin est bloqué par un échec antérieur.
   */
  isPathBlocked(agentId, statement) {
    return this.negativeMemory.isPathBlocked(agentId, statement);
  }

  /**
   * Compiler un plasmide culturel à partir d'un SearchGenome validé.
   */
  compileCulture(searchGenome, validation) {
    return this.culture.compilePlasmid(searchGenome, validation);
  }

  getNegativeTrails(agentId) {
    return this.negativeMemory.getActiveTrails(agentId);
  }
}

module.exports = { SearchIntegration };

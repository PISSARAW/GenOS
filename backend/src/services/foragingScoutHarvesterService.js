/**
 * Foraging Scout-Harvester Service — Écologie Comportementale & Division du Travail.
 *
 * Implémente :
 * 1. Théorème de la Valeur Marginale de Charnov (Marginal Value Theorem - MVT) :
 *    Quitte un îlot web (patch departure) quand dI/dt < seuil moyen d'environnement.
 * 2. Vols de Lévy (Lévy Flights) :
 *    Alternance optimale entre exploitation locale dense et sauts exploratoires macro.
 * 3. Stigmergie Scout / Harvester :
 *    L'éclaireur dépose un token d'évidence scellé ; le moissonneur l'exploite en local.
 */

const crypto = require('crypto');

class ForagingScoutHarvesterService {
  constructor(options = {}) {
    this.envMeanReturnRate = options.envMeanReturnRate || 0.35; // Seuil theta de Charnov
    this.levyExponent = options.levyExponent || 2.0; // mu dans [1, 3]
    this.pheromoneLedger = new Map();
  }

  /**
   * Évalue le rendement d'un patch web selon le théorème de Charnov (MVT)
   */
  evaluatePatchYield(patchHistory = [], elapsedTimeSec = 1) {
    if (!patchHistory.length) {
      return { marginalYield: 0, shouldDepart: false, reason: 'New unvisited patch' };
    }

    // Calcul de l'information cumulée acquise dans le patch
    const totalInfoGain = patchHistory.reduce((acc, step) => acc + (Number(step.infoGain) || 0), 0);
    const recentInfoGain = patchHistory.slice(-2).reduce((acc, step) => acc + (Number(step.infoGain) || 0), 0);
    const dt = Math.max(1, elapsedTimeSec);

    // Dérivée instantanée dI/dt
    const marginalYield = Number((recentInfoGain / dt).toFixed(4));
    const averagePatchYield = Number((totalInfoGain / dt).toFixed(4));

    // Règle de Charnov : si dI/dt < theta, délogement immédiat (patch departure)
    const shouldDepart = marginalYield < this.envMeanReturnRate;

    return {
      totalInfoGain,
      marginalYield,
      averagePatchYield,
      envThreshold: this.envMeanReturnRate,
      shouldDepart,
      decision: shouldDepart ? 'PATCH_DEPARTURE' : 'EXPLOIT_PATCH',
      reason: shouldDepart
        ? `Marginal yield (${marginalYield}) dropped below environmental return rate (${this.envMeanReturnRate})`
        : `Patch remains productive (${marginalYield} >= ${this.envMeanReturnRate})`
    };
  }

  /**
   * Calcule le prochain saut d'exploration selon une distribution de Lévy
   */
  computeLevyFlightStep(iteration = 1) {
    // Génération d'une longueur de pas selon Pareto/Lévy : P(l) ~ l^(-mu)
    const u = Math.max(0.0001, Math.random());
    const stepLength = Math.max(1, Math.round(Math.pow(u, -1 / (this.levyExponent - 1))));

    // Classification du mouvement
    const isMacroJump = stepLength > 5;
    const mode = isMacroJump ? 'LEVY_MACRO_JUMP' : 'LOCAL_INTENSIVE_EXPLOITATION';

    return {
      iteration,
      stepLength,
      isMacroJump,
      mode,
      strategyGuidance: isMacroJump
        ? 'Execute wide exploratory jump: query new search index, pivot domain or change search terms'
        : 'Execute local intensive exploitation: drill down into sub-menus, table pagination or form filters'
    };
  }

  /**
   * Dépôt stigmergique par l'agent Scout (Éclaireur)
   */
  depositPheromoneEvidence(scoutId, targetUrl, extractedArtifact = {}) {
    const tokenId = `phero_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    const payload = {
      tokenId,
      scoutId,
      targetUrl,
      artifactType: extractedArtifact.type || 'web_extracted_data',
      localPath: extractedArtifact.localPath || null,
      sha256: extractedArtifact.sha256 || null,
      keyFacts: extractedArtifact.keyFacts || {},
      extractedKeyFacts: extractedArtifact.keyFacts || {},
      confidence: Number(extractedArtifact.confidence || 0.95),
      timestamp
    };

    const signature = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const sealedToken = { ...payload, signature };

    this.pheromoneLedger.set(tokenId, sealedToken);
    return sealedToken;
  }

  /**
   * Moisson par l'agent Harvester : récupération et vérification du token stigmergique
   */
  harvestEvidence(tokenId, harvesterId = 'harvester-01') {
    const token = this.pheromoneLedger.get(tokenId);
    if (!token) return { success: false, error: `Pheromone token not found: ${tokenId}` };

    // Vérification d'intégrité de la trace stigmergique
    const { signature, ...payload } = token;
    const expectedSig = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const isValid = signature === expectedSig;

    return {
      success: isValid,
      harvesterId,
      tokenId,
      evidenceIntact: isValid,
      readyForDeterministicExecution: isValid,
      handoffData: payload
    };
  }
}

const defaultForaging = new ForagingScoutHarvesterService();

module.exports = {
  ForagingScoutHarvesterService,
  defaultForaging
};

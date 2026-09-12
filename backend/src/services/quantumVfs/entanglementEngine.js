/**
 * @file entanglementEngine.js
 * @description Point 4 du Quantum VFS : L'Intrication Quantique.
 * Transposition de l'intrication quantique et de la non-localité (Aspect / Bell) :
 * Les fichiers interdépendants (ex. contrat <-> implémentation, schéma <-> migration,
 * service <-> test unitaire) sont intriqués dans un état conjoint inséparable.
 * Toute mutation d'invariant sur A déclenche une répercussion instantanée sur B.
 */

const crypto = require('crypto');

/**
 * Modes d'intrication reconnus
 */
const EntanglementMode = Object.freeze({
  INTERFACE_IMPLEMENTATION: 'INTERFACE_IMPLEMENTATION', // Signature <-> Corps
  SCHEMA_MIGRATION: 'SCHEMA_MIGRATION',                 // Modèle <-> SQL
  SOURCE_TEST: 'SOURCE_TEST',                           // Logique <-> Validation
  BIDIRECTIONAL_INVARIANT: 'BIDIRECTIONAL_INVARIANT'    // Invariants synchrones
});

/**
 * Représente un lien d'intrication entre deux ou plusieurs fichiers
 */
class EntangledPair {
  constructor({ id, pathA, pathB, mode = EntanglementMode.INTERFACE_IMPLEMENTATION, invariantRules = [] }) {
    this.id = id || `ent_${crypto.randomBytes(4).toString('hex')}`;
    this.pathA = pathA;
    this.pathB = pathB;
    this.mode = mode;
    this.invariantRules = Array.isArray(invariantRules) ? invariantRules : [];
    this.lastTeleportedAt = null;
    this.spinState = 1; // +1 (up) / -1 (down) état de phase conjointe
    this.correlationHistory = [];
  }

  /**
   * Propage instantanément une mutation de spin de pathA vers pathB ou vice versa
   */
  teleportMutation(sourcePath, mutationPayload) {
    const isSourceA = sourcePath === this.pathA;
    const targetPath = isSourceA ? this.pathB : this.pathA;

    // Inversion de spin de phase (analogue spin intriqué anti-aligné)
    this.spinState = -this.spinState;
    this.lastTeleportedAt = new Date().toISOString();

    const signal = {
      entanglementId: this.id,
      mode: this.mode,
      sourcePath,
      targetPath,
      spin: this.spinState,
      teleportedAt: this.lastTeleportedAt,
      mutationPayload,
      requiredAdaptations: this.computeAdaptationDirectives(mutationPayload)
    };

    this.correlationHistory.push({
      timestamp: Date.now(),
      sourcePath,
      targetPath,
      spin: this.spinState
    });

    return signal;
  }

  /**
   * Calcule les directives d'adaptation immédiate imposées par l'invariant
   */
  computeAdaptationDirectives(mutation) {
    const directives = [];
    if (this.mode === EntanglementMode.INTERFACE_IMPLEMENTATION && mutation.signatureChanged) {
      directives.push({
        action: 'UPDATE_SIGNATURE',
        expectedSignature: mutation.newSignature,
        reason: 'Violation de parité d\'interface intriquée'
      });
    } else if (this.mode === EntanglementMode.SOURCE_TEST) {
      directives.push({
        action: 'SYNCHRONIZE_ASSERTION',
        targetSymbols: mutation.modifiedSymbols || [],
        reason: 'Désynchronisation du contrat de test unitaire'
      });
    } else {
      directives.push({
        action: 'VERIFY_INVARIANT',
        rules: this.invariantRules
      });
    }
    return directives;
  }
}

/**
 * Registre et coordinateur de l'intrication quantique du VFS
 */
class QuantumEntanglementRegistry {
  constructor() {
    this.pairs = new Map();
    this.fileIndex = new Map(); // filePath -> Set<pairId>
  }

  /**
   * Établit un lien d'intrication entre deux fichiers
   */
  entangle(pathA, pathB, mode = EntanglementMode.INTERFACE_IMPLEMENTATION, invariantRules = []) {
    if (!pathA || !pathB || pathA === pathB) {
      throw new Error('L\'intrication requiert deux chemins de fichiers distincts et valides.');
    }
    const pair = new EntangledPair({ pathA, pathB, mode, invariantRules });
    this.pairs.set(pair.id, pair);

    if (!this.fileIndex.has(pathA)) this.fileIndex.set(pathA, new Set());
    if (!this.fileIndex.has(pathB)) this.fileIndex.set(pathB, new Set());

    this.fileIndex.get(pathA).add(pair.id);
    this.fileIndex.get(pathB).add(pair.id);

    return pair;
  }

  /**
   * Diffuse instantanément une modification à tous les fichiers intriqués
   */
  propagateMutation(sourcePath, mutationPayload = {}) {
    const pairIds = this.fileIndex.get(sourcePath);
    if (!pairIds || pairIds.size === 0) {
      return { entangled: false, signals: [] };
    }

    const signals = [];
    for (const pairId of pairIds) {
      const pair = this.pairs.get(pairId);
      if (pair) {
        const signal = pair.teleportMutation(sourcePath, mutationPayload);
        signals.push(signal);
      }
    }

    return {
      entangled: true,
      signalsCount: signals.length,
      signals
    };
  }

  /**
   * Vérifie l'inégalité de Bell (CHSH) pour mesurer le degré de non-localité
   * En physique classique, |S| <= 2. Dans un système intriqué, |S| > 2 (jusqu'à 2*sqrt(2) approx 2.828)
   */
  verifyBellInequality() {
    let totalCorrelations = 0;
    for (const pair of this.pairs.values()) {
      totalCorrelations += pair.correlationHistory.length;
    }
    // Simulation du paramètre CHSH en fonction du taux de réactivité sans latence
    const baseChsh = totalCorrelations > 0 ? 2.828 : 2.0;
    return {
      chshParameter: baseChsh,
      violatesClassicalLimit: baseChsh > 2.0,
      quantumAdvantage: baseChsh > 2.0 ? 'NON_LOCAL_INSTANTANEOUS_SYNC' : 'CLASSICAL_SEPARABLE',
      entangledPairsCount: this.pairs.size
    };
  }

  /**
   * Retourne la topologie globale des dépendances intriquées
   */
  getTopology() {
    return Array.from(this.pairs.values()).map(p => ({
      id: p.id,
      pathA: p.pathA,
      pathB: p.pathB,
      mode: p.mode,
      spin: p.spinState,
      lastTeleportedAt: p.lastTeleportedAt
    }));
  }
}

module.exports = {
  EntanglementMode,
  EntangledPair,
  QuantumEntanglementRegistry
};

/**
 * @file tunnelingWriter.js
 * @description Point 6 du Quantum VFS : L'Effet Tunnel.
 * Transposition de l'effet tunnel quantique (Gamow / Traversée de barrière) :
 * T = exp(-2 * kappa * a) avec kappa = sqrt(2*m*(V_0 - E)) / hbar
 * Permet aux agents de traverser les verrous bloquants (locks, contentions d'I/O)
 * en projetant l'écriture dans une couche d'ombre quantique (shadow layer)
 * réconciliée de manière asymptotique dès l'abaissement de la barrière.
 */

const crypto = require('crypto');

/**
 * Barrière de potentiel représentant un verrou ou une contention de ressource
 */
class PotentialBarrier {
  constructor({ id, height = 2.0, width = 1.0, isLocked = true, reason = 'RESOURCE_LOCKED' }) {
    this.id = id || `bar_${crypto.randomBytes(4).toString('hex')}`;
    this.height = Math.max(0.1, Number(height) || 2.0); // V_0
    this.width = Math.max(0.1, Number(width) || 1.0);   // a
    this.isLocked = Boolean(isLocked);
    this.reason = reason;
  }
}

/**
 * Moteur d'écriture quantique par effet tunnel
 */
class TunnelingWriter {
  constructor() {
    this.barriers = new Map(); // filePath -> PotentialBarrier
    this.shadowLayers = new Map(); // filePath -> ShadowWrite
    this.canonicalFiles = new Map(); // filePath -> content
  }

  /**
   * Installe une barrière de potentiel (verrou) sur un fichier
   */
  setBarrier(filePath, height = 2.0, width = 1.0, reason = 'MUTEX_LOCK') {
    const barrier = new PotentialBarrier({ height, width, isLocked: true, reason });
    this.barriers.set(filePath, barrier);
    return barrier;
  }

  /**
   * Abaisse la barrière de potentiel (déverrouillage)
   */
  clearBarrier(filePath) {
    this.barriers.delete(filePath);
    return this.coalesceShadow(filePath);
  }

  /**
   * Calcule le coefficient de transmission T par effet tunnel
   */
  calculateTunnelingProbability(energy, barrier) {
    const E = Math.max(0.01, Number(energy) || 1.0);
    const V0 = barrier.height;
    const a = barrier.width;

    if (E >= V0) return 1.0; // Énergie suffisante pour franchir classiquement

    // kappa = sqrt(2 * m * (V0 - E)) / hbar (avec m=1, hbar=1 normalisés)
    const kappa = Math.sqrt(2 * (V0 - E));
    const transmissionCoeff = Math.exp(-2 * kappa * a);
    return Number(Math.max(0.0001, Math.min(1.0, transmissionCoeff)).toFixed(4));
  }

  /**
   * Écrit dans un fichier avec traversée quantique automatique si verrouillé
   */
  writeWithTunneling(filePath, content, agentEnergy = 1.0) {
    const barrier = this.barriers.get(filePath);

    if (!barrier || !barrier.isLocked) {
      // Écriture classique directe en l'absence de barrière
      this.canonicalFiles.set(filePath, content);
      return {
        tunneled: false,
        coalescedImmediately: true,
        filePath,
        contentLength: content.length,
        status: 'DIRECT_CLASSICAL_WRITE'
      };
    }

    // Présence d'un verrou : calcul de la probabilité de tunnelisation
    const prob = this.calculateTunnelingProbability(agentEnergy, barrier);
    const shadowId = `shadow_${crypto.randomBytes(4).toString('hex')}`;
    const shadowEntry = {
      shadowId,
      filePath,
      content,
      tunneledAt: new Date().toISOString(),
      agentEnergy,
      barrierHeight: barrier.height,
      transmissionProbability: prob,
      pendingReconciliation: true
    };

    this.shadowLayers.set(filePath, shadowEntry);

    return {
      tunneled: true,
      coalescedImmediately: false,
      filePath,
      shadowId,
      transmissionProbability: prob,
      barrierReason: barrier.reason,
      status: 'QUANTUM_TUNNELED_SHADOW_PROJECTED'
    };
  }

  /**
   * Réconcilie la couche d'ombre vers le fichier canonique une fois la barrière levée
   */
  coalesceShadow(filePath) {
    const shadow = this.shadowLayers.get(filePath);
    if (!shadow) {
      return { coalesced: false, reason: 'AUCUNE_COUCHE_OMBRE' };
    }

    this.canonicalFiles.set(filePath, shadow.content);
    this.shadowLayers.delete(filePath);

    return {
      coalesced: true,
      filePath,
      shadowId: shadow.shadowId,
      content: shadow.content,
      status: 'ASYMPTOTIC_COALESCENCE_COMPLETED'
    };
  }

  /**
   * Lit le contenu effectif (ombre prioritaire si présente, sinon canonique)
   */
  readEffective(filePath) {
    if (this.shadowLayers.has(filePath)) {
      return {
        content: this.shadowLayers.get(filePath).content,
        isShadow: true
      };
    }
    return {
      content: this.canonicalFiles.get(filePath) || null,
      isShadow: false
    };
  }
}

module.exports = {
  PotentialBarrier,
  TunnelingWriter
};

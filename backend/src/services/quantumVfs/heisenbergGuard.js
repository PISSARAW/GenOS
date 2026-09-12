/**
 * @file heisenbergGuard.js
 * @description Point 5 du Quantum VFS : Le Principe d'Incertitude d'Heisenberg.
 * Transposition du principe fondamental : Delta_x * Delta_p >= hbar / 2
 * Établit la balance adaptative entre la précision d'audit (localisation spatiale Delta_x)
 * et la vélocité de génération de l'agent (quantité de mouvement Delta_p).
 */

const HBAR_OVER_TWO = 0.5; // Constante normalisée d'incertitude minimale

/**
 * Régimes d'opération d'I/O quantique
 */
const HeisenbergRegime = Object.freeze({
  HIGH_VELOCITY: 'HIGH_VELOCITY',         // Haute vélocité : audit allégé, fluidité maximale (p élevé, Delta_x large)
  BALANCED: 'BALANCED',                   // Régime standard de développement
  MAX_OBSERVABILITY: 'MAX_OBSERVABILITY'  // Point d'ancrage / audit certifié (p nul, Delta_x infime)
});

/**
 * Gardien d'I/O et de traçabilité adaptative selon l'incertitude d'Heisenberg
 */
class HeisenbergGuard {
  constructor(options = {}) {
    this.hBar = Number(options.hBar) || 1.0;
    this.minBound = this.hBar / 2.0;
    this.currentMomentum = 1.0; // p (vélocité/débit d'actions par unité de temps)
    this.lastActionTimestamp = Date.now();
    this.actionWindow = [];
    this.auditLevel = 'standard';
  }

  /**
   * Enregistre une impulsion d'écriture de l'agent
   * @param {number} intensity - Énergie de l'action
   */
  recordPulse(intensity = 1.0) {
    const now = Date.now();
    this.actionWindow.push({ timestamp: now, intensity });
    // Conserver les actions des 5 dernières secondes
    this.actionWindow = this.actionWindow.filter(a => now - a.timestamp <= 5000);

    // Calcul de la quantité de mouvement p (taux de mutation pondéré)
    const totalEnergy = this.actionWindow.reduce((sum, a) => sum + a.intensity, 0.0);
    this.currentMomentum = Math.max(0.1, totalEnergy / Math.max(1, this.actionWindow.length));
    this.lastActionTimestamp = now;

    return this.calibrateObservability();
  }

  /**
   * Calibre le niveau d'audit et l'incertitude de position en fonction du momentum
   */
  calibrateObservability() {
    // Delta_p est proportionnel au momentum actuel
    const deltaP = Math.max(0.1, this.currentMomentum);
    // Delta_x >= (hbar / 2) / Delta_p
    const deltaX = this.minBound / deltaP;

    let regime = HeisenbergRegime.BALANCED;
    if (deltaP >= 2.0) {
      regime = HeisenbergRegime.HIGH_VELOCITY;
      this.auditLevel = 'shallow'; // Seul le hash global est suivi, traces micro désactivées
    } else if (deltaP <= 0.3) {
      regime = HeisenbergRegime.MAX_OBSERVABILITY;
      this.auditLevel = 'deep'; // Audit millimétrique, AST diffs complets, signatures d'invariants
    } else {
      this.auditLevel = 'standard';
    }

    return {
      regime,
      momentum: Number(this.currentMomentum.toFixed(4)),
      deltaP: Number(deltaP.toFixed(4)),
      deltaX: Number(deltaX.toFixed(4)),
      uncertaintyProduct: Number((deltaX * deltaP).toFixed(4)),
      auditLevel: this.auditLevel,
      allowsDeepAudit: this.auditLevel === 'deep',
      throttleRequired: false
    };
  }

  /**
   * Force une mesure de précision absolue (Delta_x -> 0)
   * Cette mesure effondre le momentum de l'agent (p -> 0)
   */
  freezeForMeasurement(reason = 'SECURITY_GATE') {
    this.actionWindow = [];
    this.currentMomentum = 0.05; // Moment cinétique quasi-nul
    const deltaP = 0.1;
    const deltaX = this.minBound / deltaP;
    this.auditLevel = 'deep';

    return {
      frozen: true,
      reason,
      regime: HeisenbergRegime.MAX_OBSERVABILITY,
      auditLevel: 'deep',
      deltaX: Number(deltaX.toFixed(4)),
      certifiedPrecision: 'ABSOLUTE_ACCURACY'
    };
  }
}

module.exports = {
  HBAR_OVER_TWO,
  HeisenbergRegime,
  HeisenbergGuard
};

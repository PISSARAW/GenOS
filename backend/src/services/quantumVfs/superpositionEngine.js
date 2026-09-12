/**
 * @file superpositionEngine.js
 * @description Point 3 du Quantum VFS : La Superposition Quantique.
 * Transposition du principe de superposition :
 * |psi> = sum(alpha_i * |S_i>) avec sum(|alpha_i|^2) = 1
 * Permet à un fichier de coexister simultanément dans plusieurs états
 * spéculatifs concurrents en mémoire vive sans duplication lourde du système de fichiers.
 */

const crypto = require('crypto');

/**
 * Représente un état propre (eigenstate) dans la superposition quantique
 */
class Eigenstate {
  constructor({ id, label, content, amplitude = 1.0, metadata = {} }) {
    this.id = id || `state_${crypto.randomBytes(4).toString('hex')}`;
    this.label = label || 'unnamed_hypothesis';
    this.content = String(content || '');
    this.rawWeight = Number.isFinite(amplitude) ? Math.max(0.01, amplitude) : 1.0;
    this.amplitude = this.rawWeight; // alpha_i normalisé
    this.probability = 0.0; // |alpha_i|^2 calculé après normalisation
    this.metadata = metadata;
    this.fitnessScore = null;
  }
}

/**
 * Moteur de superposition quantique pour un fichier virtuel
 */
class QuantumSuperposition {
  constructor(baseContent, filePath = 'anonymous.js') {
    this.filePath = filePath;
    this.baseContent = String(baseContent || '');
    this.eigenstates = new Map();
    this.isCollapsed = false;
    this.collapsedState = null;

    // État fondamental initial |S_0>
    const groundState = new Eigenstate({
      label: 'ground_state',
      content: this.baseContent,
      amplitude: 1.0,
      metadata: { isGroundState: true }
    });
    this.eigenstates.set(groundState.id, groundState);
    this.normalizeAmplitudes();
  }

  /**
   * Ajoute une nouvelle hypothèse spéculative dans la superposition
   */
  addEigenstate(label, content, initialWeight = 1.0, metadata = {}) {
    if (this.isCollapsed) {
      throw new Error('Impossible d\'ajouter un état : la superposition a déjà subi un effondrement classique.');
    }
    const state = new Eigenstate({
      label,
      content,
      amplitude: Math.max(0.01, Number(initialWeight) || 1.0),
      metadata
    });
    this.eigenstates.set(state.id, state);
    this.normalizeAmplitudes();
    return state;
  }

  /**
   * Normalise les amplitudes de probabilité : sum(|alpha_i|^2) = 1
   */
  normalizeAmplitudes() {
    let totalPower = 0.0;
    for (const state of this.eigenstates.values()) {
      totalPower += state.rawWeight * state.rawWeight;
    }
    const normFactor = totalPower > 0 ? Math.sqrt(totalPower) : 1.0;
    for (const state of this.eigenstates.values()) {
      state.amplitude = state.rawWeight / normFactor;
      state.probability = Number((state.amplitude * state.amplitude).toFixed(4));
    }
  }

  /**
   * Évalue spéculativement tous les états en superposition en parallèle
   * @param {Function} evaluatorFn - async (content, state) => score (0.0 - 1.0)
   */
  async evaluateSuperposition(evaluatorFn) {
    if (typeof evaluatorFn !== 'function') {
      throw new TypeError('evaluatorFn doit être une fonction asynchrone d\'évaluation.');
    }
    const evaluations = [];
    for (const state of this.eigenstates.values()) {
      evaluations.push(
        (async () => {
          try {
            const score = await evaluatorFn(state.content, state);
            state.fitnessScore = Number.isFinite(score) ? Math.max(0.0, Math.min(1.0, score)) : 0.0;
            // Modulation du poids par le score de fitness
            state.rawWeight = Math.max(0.01, state.rawWeight * (1.0 + state.fitnessScore));
          } catch (err) {
            state.fitnessScore = 0.0;
            state.rawWeight = 0.01;
            state.metadata.evaluationError = err.message;
          }
        })()
      );
    }
    await Promise.all(evaluations);
    this.normalizeAmplitudes();
    return this.getStateDistribution();
  }

  /**
   * Retourne la distribution de probabilité actuelle |psi>
   */
  getStateDistribution() {
    const distribution = [];
    for (const state of this.eigenstates.values()) {
      distribution.push({
        id: state.id,
        label: state.label,
        amplitude: Number(state.amplitude.toFixed(4)),
        probability: state.probability,
        fitnessScore: state.fitnessScore
      });
    }
    return distribution;
  }

  /**
   * Provoque l'effondrement de la fonction d'onde vers un état propre unique
   * @param {'highest_probability'|'highest_fitness'|'ground_state'} strategy
   */
  collapse(strategy = 'highest_probability') {
    if (this.isCollapsed) return this.collapsedState;

    let selectedState = null;
    const states = Array.from(this.eigenstates.values());

    if (strategy === 'highest_fitness') {
      selectedState = states.reduce((prev, curr) => ((curr.fitnessScore || 0) > (prev.fitnessScore || 0) ? curr : prev), states[0]);
    } else if (strategy === 'ground_state') {
      selectedState = states.find(s => s.metadata?.isGroundState) || states[0];
    } else {
      // 'highest_probability' par défaut
      selectedState = states.reduce((prev, curr) => (curr.probability > prev.probability ? curr : prev), states[0]);
    }

    this.isCollapsed = true;
    this.collapsedState = {
      filePath: this.filePath,
      id: selectedState.id,
      label: selectedState.label,
      content: selectedState.content,
      probabilityAtCollapse: selectedState.probability,
      fitnessScore: selectedState.fitnessScore
    };

    return this.collapsedState;
  }
}

module.exports = {
  Eigenstate,
  QuantumSuperposition
};

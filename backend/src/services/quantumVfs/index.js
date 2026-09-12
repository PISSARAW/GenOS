/**
 * @file index.js
 * @description Point d'entrée unifié du Quantum VFS (Virtual File System) de GenOS.
 * Expose les 7 piliers fondamentaux de la mécanique quantique appliqués à la gestion
 * de fichiers pour les agents autonomes :
 * 1. Quantification (quantumAst)
 * 2. Dualité Onde-Corpuscule (waveParticleFile)
 * 3. Superposition Quantique (superpositionEngine)
 * 4. Intrication Quantique (entanglementEngine)
 * 5. Principe d'Incertitude d'Heisenberg (heisenbergGuard)
 * 6. Effet Tunnel (tunnelingWriter)
 * 7. Décohérence Quantique & Cristallisation (decoherenceEngine)
 */

const {
  QuantumAstMutation,
  AST_ENERGY_LEVELS,
  applyQuantumTransition,
  measureEnergyDifference
} = require('./quantumAst');

const {
  RepresentationMode,
  WaveParticleFile
} = require('./waveParticleFile');

const {
  QuantumSuperposition,
  Eigenstate
} = require('./superpositionEngine');

const {
  EntanglementMode,
  EntangledPair,
  QuantumEntanglementRegistry
} = require('./entanglementEngine');

const {
  HBAR,
  HeisenbergGuard
} = require('./heisenbergGuard');

const {
  BarrierType,
  TunnelingWriter
} = require('./tunnelingWriter');

const {
  ObservableTrigger,
  QuantumDecoherenceEngine
} = require('./decoherenceEngine');

module.exports = {
  // 1. Quantification
  QuantumAstMutation,
  AST_ENERGY_LEVELS,
  applyQuantumTransition,
  measureEnergyDifference,

  // 2. Dualité Onde-Corpuscule
  RepresentationMode,
  WaveParticleFile,

  // 3. Superposition Quantique
  QuantumSuperposition,
  Eigenstate,

  // 4. Intrication Quantique
  EntanglementMode,
  EntangledPair,
  QuantumEntanglementRegistry,

  // 5. Principe d'Incertitude d'Heisenberg
  HBAR,
  HeisenbergGuard,

  // 6. Effet Tunnel
  BarrierType,
  TunnelingWriter,

  // 7. Décohérence Quantique
  ObservableTrigger,
  QuantumDecoherenceEngine
};

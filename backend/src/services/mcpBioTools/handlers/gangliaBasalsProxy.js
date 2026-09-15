'use strict';

const gangliaBasals = require('./gangliaBasals');

module.exports = {
  handleGangliaBasals: gangliaBasals.handleGangliaBasals,
  handleGangliaBasalsError: gangliaBasals.handleGangliaBasalsError,

  // Hooks d'adaptation pour persistance hors process
  setAdaptivePersister: gangliaBasals.setAdaptivePersister,
  getAdaptivePersister: gangliaBasals.getAdaptivePersister,

  // État mutable en mémoire (exporté pour compatibilité + persistance)
  legacyDopamineState: gangliaBasals.legacyDopamineState,

  // Méthode de snapshot/restauration pour le persister objet
  getSnapshot() {
    const entries = {};
    for (const [ctxId, dState] of gangliaBasals.legacyDopamineState.entries()) {
      entries[ctxId] = {
        ctxId,
        valeurs_attendues: Object.fromEntries(dState.valeurs_attendues),
        historique: dState.historique,
        baseline_attraction: dState.baseline_attraction,
        restoredFromStorage: dState.restoredFromStorage || false
      };
    }
    return entries;
  },

  onMutation(snapshot) {
    // Restore depuis snapshot si le persister le demande après reload
    for (const [ctxId, data] of Object.entries(snapshot)) {
      const existing = gangliaBasals.legacyDopamineState.get(ctxId);
      if (existing) {
        existing.valeurs_attendues = new Map(Object.entries(data.valeurs_attendues || {}));
        existing.historique = data.historique || [];
        existing.baseline_attraction = data.baseline_attraction ?? 1.0;
        existing.restoredFromStorage = true;
      }
    }
  }
};

/**
 * Generalized Foraging — Phase 8.
 *
 * Un SearchPatch peut être une hypothèse, une famille de fichiers,
 * une base documentaire, une stratégie, une branche, un outil, etc.
 */

const { ForagingScoutHarvesterService } = require('../foragingScoutHarvesterService')

class SearchPatchService {
  constructor(options = {}) {
    this.foraging = new ForagingScoutHarvesterService(options);
    this.patches = new Map();
  }

  createPatch(id, type, metadata = {}) {
    const patch = {
      id,
      type, // 'hypothesis' | 'file-family' | 'document-base' | 'strategy' | 'branch' | 'tool' | 'param-space'
      metadata,
      history: [],
      createdAt: Date.now(),
      visits: 0
    };
    this.patches.set(id, patch);
    return patch;
  }

  evaluatePatch(patchId, elapsedTimeSec = 1) {
    const patch = this.patches.get(patchId);
    if (!patch) return null;

    const result = this.foraging.evaluatePatchYield(patch.history, elapsedTimeSec);
    return { ...result, patchId, visits: patch.visits };
  }

  recordStep(patchId, infoGain, cost = 1) {
    const patch = this.patches.get(patchId);
    if (!patch) return null;

    patch.history.push({ infoGain, cost, ts: Date.now() });
    patch.visits++;

    return this.evaluatePatch(patchId);
  }

  shouldDepart(patchId, elapsedTimeSec = 1) {
    const result = this.evaluatePatch(patchId, elapsedTimeSec);
    return result ? result.shouldDepart : false;
  }

  findBestAlternative(currentPatchId, availablePatchIds) {
    let bestId = null;
    let bestYield = -Infinity;

    for (const id of availablePatchIds) {
      if (id === currentPatchId) continue;
      const patch = this.patches.get(id);
      if (!patch) continue;
      const avgYield = patch.history.reduce((a, s) => a + s.infoGain, 0) / Math.max(1, patch.history.length);
      if (avgYield > bestYield) {
        bestYield = avgYield;
        bestId = id;
      }
    }

    return bestId;
  }
}

module.exports = { SearchPatchService }

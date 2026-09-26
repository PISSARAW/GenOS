'use strict';

const { createTransferBundle, validateTransferBundle, createStateCapsule, createArtifact, createClaim, createDecision, createProvenance, mergeBundles, filterBundle, bundleToSummary } = require('./morphologyTransferBundle');
const { createGenericAdapter } = require('./genericAdapter');
const { createSyncytiumToTrinityAdapter } = require('./specializedAdapters/syncytiumToTrinity');
const { createMigrationValidator } = require('./migrationValidator');

class AdapterRegistry {
  constructor() {
    this.genericAdapters = new Map();
    this.specializedAdapters = new Map();
    this.defaultAdapter = null;
  }

  registerGeneric(topology, adapter) {
    this.genericAdapters.set(topology, adapter);
  }

  registerSpecialized(fromTopology, toTopology, adapter) {
    const key = `${fromTopology}->${toTopology}`;
    this.specializedAdapters.set(key, adapter);
  }

  getAdapter(fromTopology, toTopology) {
    const specializedKey = `${fromTopology}->${toTopology}`;
    if (this.specializedAdapters.has(specializedKey)) {
      return this.specializedAdapters.get(specializedKey);
    }

    if (this.genericAdapters.has(fromTopology) && this.genericAdapters.has(toTopology)) {
      return this.defaultAdapter || this.createFallbackAdapter(fromTopology, toTopology);
    }

    return this.defaultAdapter || this.createFallbackAdapter(fromTopology, toTopology);
  }

  createFallbackAdapter(fromTopology, toTopology) {
    return {
      name: `fallback_${fromTopology}_to_${toTopology}`,
      fromTopology,
      toTopology,
      lossEstimate: 0.5,
      exportTransferBundle: async (node, context) => {
        const { createTransferBundle, createProvenance } = require('./morphologyTransferBundle');
        return createTransferBundle({
          mission: context.missionId,
          scope: node.scope || 'mission',
          artifacts: [],
          claims: [],
          evidence: context.evidence || [],
          uncertainties: ['Fallback adapter used - semantic preservation not guaranteed'],
          decisions: [],
          unresolvedQuestions: ['No specialized or generic adapter available'],
          stateCapsules: [],
          workerCapabilities: [],
          resources: context.budget || {},
          provenance: createProvenance(fromTopology, node.variant, context.executionId),
          sourceReceipt: context.receipts?.[context.receipts.length - 1] || null,
          topologyId: fromTopology,
          variant: node.variant
        });
      },
      importTransferBundle: async (bundle, targetNode, context) => {
        return { context, output: null, imported: true, warning: 'Fallback adapter used' };
      }
    };
  }

  setDefaultAdapter(adapter) {
    this.defaultAdapter = adapter;
  }
}

const registry = new AdapterRegistry();
registry.registerSpecialized('syncytium', 'trinity', createSyncytiumToTrinityAdapter());

module.exports = {
  BUNDLE_VERSION: 1,
  createTransferBundle,
  validateTransferBundle,
  createStateCapsule,
  createArtifact,
  createClaim,
  createDecision,
  createProvenance,
  mergeBundles,
  filterBundle,
  bundleToSummary,
  createGenericAdapter,
  createSyncytiumToTrinityAdapter,
  createMigrationValidator,
  AdapterRegistry,
  registry
};
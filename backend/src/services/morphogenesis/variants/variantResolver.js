'use strict';

const { VariantRegistry, defaultRegistry } = require('./variantRegistry');
const { PatchExecutor } = require('../transitions/patchExecutor');
const { createMorphologyPatch, createOperation } = require('../transitions/morphologyPatch');

class VariantResolver {
  constructor(opts = {}) {
    this.registry = opts.registry || defaultRegistry;
    this.patchExecutor = opts.patchExecutor || new PatchExecutor();
  }

  async changeVariant(nodeId, graph, context, targetVariant) {
    const node = graph.nodes.find(n => n.nodeId === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const currentTopology = node.topology;
    const currentVariant = node.variant;

    if (currentVariant === targetVariant) {
      return { success: true, changed: false, reason: 'Already at target variant' };
    }

    const transition = this.registry.getTransition(currentTopology, currentVariant, currentTopology, targetVariant);
    if (!transition) {
      return { success: false, changed: false, reason: `No transition rule from ${currentVariant} to ${targetVariant}` };
    }

    const canTransition = this.registry.canTransition(currentTopology, currentVariant, currentTopology, targetVariant, context);
    if (!canTransition.allowed) {
      return { success: false, changed: false, reason: canTransition.reason };
    }

    const patch = createMorphologyPatch({
      baseGraphVersion: graph.version,
      operations: [createOperation('CHANGE_VARIANT', { nodeId, newVariant: targetVariant })],
      reason: `Variant change: ${currentVariant} -> ${targetVariant}`,
      evidence: transition.requiresEvidence?.map(e => ({ type: e, present: true })) || [],
      expectedGain: transition.gain || {},
      expectedCost: { tokens: transition.cost || 0 },
      authority: context.authority,
      lease: context.lease
    });

    const result = await this.patchExecutor.execute(patch, graph, context);

    if (result.success) {
      node.variant = targetVariant;
      node.variantChangedAt = new Date().toISOString();
    }

    return { success: result.success, changed: true, execution: result.execution, from: currentVariant, to: targetVariant };
  }

  async changeTopology(nodeId, graph, context, targetTopology, targetVariant = 'default') {
    const node = graph.nodes.find(n => n.nodeId === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const currentTopology = node.topology;
    const currentVariant = node.variant;

    if (currentTopology === targetTopology && currentVariant === targetVariant) {
      return { success: true, changed: false, reason: 'Already at target topology/variant' };
    }

    const transition = this.registry.getTransition(currentTopology, currentVariant, targetTopology, targetVariant);
    if (!transition) {
      return { success: false, changed: false, reason: `No transition rule from ${currentTopology}:${currentVariant} to ${targetTopology}:${targetVariant}` };
    }

    const canTransition = this.registry.canTransition(currentTopology, currentVariant, targetTopology, targetVariant, context);
    if (!canTransition.allowed) {
      return { success: false, changed: false, reason: canTransition.reason };
    }

    const patch = createMorphologyPatch({
      baseGraphVersion: graph.version,
      operations: [createOperation('CHANGE_TOPOLOGY', { nodeId, newTopology: targetTopology, newVariant: targetVariant })],
      reason: `Topology change: ${currentTopology}:${currentVariant} -> ${targetTopology}:${targetVariant}`,
      evidence: transition.requiresEvidence?.map(e => ({ type: e, present: true })) || [],
      expectedGain: transition.gain || {},
      expectedCost: { tokens: transition.cost || 0 },
      authority: context.authority,
      lease: context.lease
    });

    const result = await this.patchExecutor.execute(patch, graph, context);

    if (result.success) {
      node.topology = targetTopology;
      node.variant = targetVariant;
      node.topologyChangedAt = new Date().toISOString();
    }

    return { success: result.success, changed: true, execution: result.execution, from: `${currentTopology}:${currentVariant}`, to: `${targetTopology}:${targetVariant}` };
  }

  getAvailableVariants(topologyId) {
    return this.registry.getVariants(topologyId);
  }

  getVariantInfo(topologyId, variantId) {
    return this.registry.getVariant(topologyId, variantId);
  }

  getTransitionRules(fromTopology, fromVariant) {
    return this.registry.getTransitionsFrom(fromTopology, fromVariant);
  }

  getTransitionCost(topologyId, variantId, baseCost) {
    return this.registry.getCostModifier(topologyId, variantId, baseCost);
  }
}

const defaultResolver = new VariantResolver();

module.exports = { VariantResolver, defaultResolver };
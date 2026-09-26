'use strict';

const { createVariant, validateVariant, createTransitionRule, MATURITY_LEVELS } = require('./variantSchema');
const { createTopologyDefinition } = require('./topologyDefinition');

class VariantRegistry {
  constructor() {
    this.topologies = new Map();
    this.globalTransitions = new Map();
  }

  registerTopology(topologyInput) {
    const topology = createTopologyDefinition(topologyInput);
    this.topologies.set(topology.id, topology);
    return topology;
  }

  getTopology(id) {
    return this.topologies.get(id);
  }

  getAllTopologies() {
    return Array.from(this.topologies.values());
  }

  getVariants(topologyId) {
    const topology = this.topologies.get(topologyId);
    return topology ? Array.from(topology.variants.values()) : [];
  }

  getVariant(topologyId, variantId) {
    const topology = this.topologies.get(topologyId);
    return topology?.variants.get(variantId);
  }

  addVariant(topologyId, variantInput) {
    const topology = this.topologies.get(topologyId);
    if (!topology) throw new Error(`Topology not found: ${topologyId}`);

    const variant = createVariant({ ...variantInput, variantId: variantInput.variantId });
    topology.variants.set(variant.variantId, variant);
    return variant;
  }

  removeVariant(topologyId, variantId) {
    const topology = this.topologies.get(topologyId);
    if (!topology) return false;
    return topology.variants.delete(variantId);
  }

  registerTransition(rule) {
    const transition = createTransitionRule(rule);
    const key = `${rule.fromTopology}:${rule.fromVariant}->${rule.toTopology}:${rule.toVariant}`;
    this.globalTransitions.set(key, transition);
    return transition;
  }

  getTransition(fromTopology, fromVariant, toTopology, toVariant) {
    const key = `${fromTopology}:${fromVariant}->${toTopology}:${toVariant}`;
    return this.globalTransitions.get(key);
  }

  getTransitionsFrom(topologyId, variantId) {
    const results = [];
    for (const [key, transition] of this.globalTransitions) {
      if (key.startsWith(`${topologyId}:${variantId}->`)) {
        results.push(transition);
      }
    }
    return results;
  }

  getTransitionsTo(topologyId, variantId) {
    const results = [];
    for (const [key, transition] of this.globalTransitions) {
      if (key.endsWith(`->${topologyId}:${variantId}`)) {
        results.push(transition);
      }
    }
    return results;
  }

  canTransition(fromTopology, fromVariant, toTopology, toVariant, context = {}) {
    const transition = this.getTransition(fromTopology, fromVariant, toTopology, toVariant);
    if (!transition) return { allowed: false, reason: 'No transition rule registered' };

    if (transition.condition && typeof transition.condition === 'function') {
      if (!transition.condition(context)) {
        return { allowed: false, reason: 'Condition not met' };
      }
    }

    if (transition.requiresEvidence && Array.isArray(transition.requiresEvidence)) {
      const evidence = context.evidence || [];
      const hasEvidence = transition.requiresEvidence.every(req =>
        evidence.some(e => e.type === req || e.statement?.includes(req))
      );
      if (!hasEvidence) {
        return { allowed: false, reason: 'Required evidence not present' };
      }
    }

    return { allowed: true, transition };
  }

  getVariantMaturity(topologyId, variantId) {
    const variant = this.getVariant(topologyId, variantId);
    return variant?.maturity || 'experimental';
  }

  isVariantStable(topologyId, variantId) {
    return this.getVariantMaturity(topologyId, variantId) === 'stable';
  }

  getCompatibleOperators(topologyId, variantId) {
    const variant = this.getVariant(topologyId, variantId);
    return variant?.compatibleOperators || [];
  }

  getCostModifier(topologyId, variantId, baseCost) {
    const variant = this.getVariant(topologyId, variantId);
    if (!variant?.costModifiers) return baseCost;

    let cost = baseCost;
    for (const [key, modifier] of Object.entries(variant.costModifiers)) {
      if (typeof modifier === 'number') cost *= modifier;
      else if (typeof modifier === 'function') cost = modifier(cost);
    }
    return cost;
  }
}

const defaultRegistry = new VariantRegistry();

module.exports = { VariantRegistry, defaultRegistry, MATURITY_LEVELS };
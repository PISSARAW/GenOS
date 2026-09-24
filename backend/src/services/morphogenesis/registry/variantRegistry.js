'use strict';

function createVariantRegistry() {
  const variants = new Map();
  return {
    register: (input) => registerVariant(variants, input),
    resolve: (topology, variantId) => resolveVariant(variants, topology, variantId),
    list: (topology) => Array.from((variants.get(topology) || new Map()).keys())
  };
}

function registerVariant(variants, input = {}) {
  if (!input.topology || !input.variantId) throw new Error('topology and variantId are required');
  const topologyVariants = variants.get(input.topology) || new Map();
  if (topologyVariants.has(input.variantId)) throw new Error('topology variant already registered');
  const variant = {
    topology: input.topology,
    variantId: input.variantId,
    parameters: structuredClone(input.parameters || {}),
    policy: input.policy || null,
    description: input.description || null
  };
  topologyVariants.set(variant.variantId, variant);
  variants.set(input.topology, topologyVariants);
  return structuredClone(variant);
}

function resolveVariant(variants, topology, variantId = 'default') {
  if (variantId === 'default') return { topology, variantId, parameters: {}, policy: null, description: null };
  const variant = (variants.get(topology) || new Map()).get(variantId);
  return variant ? structuredClone(variant) : null;
}

module.exports = { createVariantRegistry };

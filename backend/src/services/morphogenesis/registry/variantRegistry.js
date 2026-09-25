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
  validateVariantInput(input);
  const topologyVariants = variants.get(input.topology) || new Map();
  assertVariantIsNew(topologyVariants, input.variantId);
  const variant = {
    topology: input.topology,
    variantId: input.variantId,
    parameters: structuredClone(input.parameters || {}),
    policy: input.policy || null,
    description: input.description || null,
    maturity: input.maturity || 'implemented',
    requiredCapabilities: structuredClone(input.requiredCapabilities || []),
    source: input.source || null
  };
  topologyVariants.set(variant.variantId, variant);
  variants.set(input.topology, topologyVariants);
  return structuredClone(variant);
}

function validateVariantInput(input) {
  if (!input.topology) throw new Error('topology is required');
  if (!input.variantId) throw new Error('variantId is required');
}

function assertVariantIsNew(variants, variantId) {
  if (variants.has(variantId)) throw new Error('topology variant already registered');
}

function resolveVariant(variants, topology, variantId = 'default') {
  if (variantId === 'default') return { topology, variantId, parameters: {}, policy: null, description: null, maturity: 'implemented', requiredCapabilities: [], source: null };
  const variant = (variants.get(topology) || new Map()).get(variantId);
  return variant ? structuredClone(variant) : null;
}

module.exports = { createVariantRegistry };

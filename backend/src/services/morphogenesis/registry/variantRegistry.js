'use strict';

const identity = require('./variantIdentity');
const { normalizeVariantSpec } = require('./variantSpec');

function createVariantRegistry() {
  const variants = new Map();
  return {
    register: (input) => registerVariant(variants, input),
    resolve: (topology, variantId) => resolveVariant(variants, topology, variantId),
    listEntries: (topology) => Array.from((variants.get(topology) || new Map()).values(), (item) => structuredClone(item)),
    list: (topology) => Array.from((variants.get(topology) || new Map()).keys())
  };
}

function registerVariant(variants, input = {}) {
  validateVariantInput(input);
  const topologyVariants = valueOr(variants.get(input.topology), new Map());
  assertVariantIsNew(topologyVariants, input.variantId);
  const variant = normalizeVariantSpec(input);
  topologyVariants.set(variant.variantId, variant);
  variants.set(input.topology, topologyVariants);
  return structuredClone(variant);
}

function valueOr(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function validateVariantInput(input) {
  if (!input.topology) throw new Error('topology is required');
  if (!input.variantId) throw new Error('variantId is required');
}

function assertVariantIsNew(variants, variantId) {
  if (variants.has(variantId)) throw new Error('topology variant already registered');
}

function resolveVariant(variants, topology, variantId = 'default') {
  const entries = variants.get(topology) || new Map();
  const canonical = variantId === 'default' && entries.has('default')
    ? 'default' : identity.canonicalVariant(topology, variantId, [...entries.keys()]);
  const variant = canonical ? entries.get(canonical) : null;
  return variant ? structuredClone(variant) : null;
}

module.exports = { createVariantRegistry };

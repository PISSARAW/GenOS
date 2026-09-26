'use strict';

const { VARIANT_FIELDS, MATURITY_LEVELS, createVariant, validateVariant, createTransitionRule } = require('./variantSchema');
const { TOPOLOGY_FIELDS, createTopologyDefinition } = require('./topologyDefinition');
const { VariantRegistry, defaultRegistry } = require('./variantRegistry');
const { VariantResolver, defaultResolver } = require('./variantResolver');

module.exports = {
  VARIANT_FIELDS,
  MATURITY_LEVELS,
  createVariant,
  validateVariant,
  createTransitionRule,
  TOPOLOGY_FIELDS,
  createTopologyDefinition,
  VariantRegistry,
  defaultRegistry,
  VariantResolver,
  defaultResolver
};
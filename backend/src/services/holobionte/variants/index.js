'use strict';

const policies = Object.freeze({
  organelle: require('./organelleHolobiont'),
  adaptiveMicrobiome: require('./adaptiveMicrobiome'),
  immuneCritical: require('./immuneCritical'),
  localFirst: require('./localFirst'),
  regenerative: require('./regenerative')
});

function getVariant(name) {
  const policy = policies[String(name || '')];
  if (!policy) throw Object.assign(new Error('Unknown Holobiont variant.'), { code: 'HOLOBIONT_VARIANT_UNKNOWN' });
  return policy;
}

module.exports = { getVariant, names: Object.freeze(Object.keys(policies)) };

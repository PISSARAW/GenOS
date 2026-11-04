'use strict';
const contract = require('./missionIntegration/contract');
module.exports = {
  prepare: require('./missionIntegration/preparation').prepare,
  canonicalFields: contract.canonicalFields,
  normalizeCanonical: contract.normalizeCanonical,
  assertUnchanged: contract.assertUnchanged,
  qualify: (...input) => require('./missionIntegration/qualification').qualify(...input)
};

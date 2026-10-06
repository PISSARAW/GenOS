'use strict';

const { AXES } = require('./trinityVariantService');

function trinityDesignSchema() {
  return Object.fromEntries(Object.entries(AXES).map(([axis, policies]) => [axis, {
    type: 'string',
    enum: Object.entries(policies).filter(([, policy]) => policy.maturity === 'implemented').map(([name]) => name)
  }]));
}

module.exports = { trinityDesignSchema };

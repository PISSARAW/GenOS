'use strict';

const zones = require('./consistencyZoneService');

function classify(schema, operation) {
  const zone = zones.resolve(schema, operation);
  const selected = zones.policy(zone);
  return {
    zone,
    classification: selected.classification,
    coordinationRequired: selected.coordinationRequired
  };
}

module.exports = { classify };

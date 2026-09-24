'use strict';

const zones = require('./consistencyZoneService');

function classify(schema, operation) {
  const zone = zones.resolve(schema, operation);
  if (isEscrowAllocation(schema, operation)) {
    return { zone, classification: 'RED', coordinationRequired: true };
  }
  const selected = zones.policy(zone);
  return {
    zone,
    classification: selected.classification,
    coordinationRequired: selected.coordinationRequired
  };
}

function isEscrowAllocation(schema, operation) {
  const path = operation?.kind?.key;
  const fieldType = operation?.fieldType || schema?.fields?.[path]?.dataType;
  return fieldType === 'ESCROW_COUNTER' && operation?.kind?.action === 'allocate';
}

module.exports = { classify };

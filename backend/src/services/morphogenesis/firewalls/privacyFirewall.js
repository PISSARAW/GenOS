'use strict';

const { findFirewall } = require('./firewallTypes');
const { PRIVACY_LEVELS: LEVELS } = require('../typing/privacyLevels');

function permitsFlow(graph, edge, levels) {
  const { sourceLevel, clearance } = levels;
  if (sourceLevel <= clearance) return true;
  const firewall = findFirewall(graph, edge, 'PRIVACY');
  if (!firewall) return false;
  if (firewall.properties.mode !== 'redact') return false;
  const redacted = LEVELS[firewall.properties.redactsTo];
  return redacted !== undefined && redacted <= clearance;
}

module.exports = { permitsFlow };

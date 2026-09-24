'use strict';

const { findFirewall } = require('./firewallTypes');

function permitsSharedState(graph, edge) {
  const firewall = findFirewall(graph, edge, 'STATE');
  return Boolean(firewall && ['mediated', 'read_only'].includes(firewall.properties.mode));
}

module.exports = { permitsSharedState };

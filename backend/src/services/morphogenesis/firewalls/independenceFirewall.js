'use strict';

const { findFirewall } = require('./firewallTypes');

function permitsCommunication(graph, edge) {
  const firewall = findFirewall(graph, edge, 'INDEPENDENCE');
  return Boolean(firewall && firewall.properties.mode === 'mediated');
}

module.exports = { permitsCommunication };

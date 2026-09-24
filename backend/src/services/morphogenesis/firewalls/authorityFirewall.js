'use strict';

const { findFirewall } = require('./firewallTypes');

function filterActions(graph, edge, actions) {
  const firewall = findFirewall(graph, edge, 'AUTHORITY');
  if (!firewall) return actions;
  const allowed = firewall.properties.allowedActions || [];
  return actions.filter((action) => allowed.includes(action));
}

module.exports = { filterActions };

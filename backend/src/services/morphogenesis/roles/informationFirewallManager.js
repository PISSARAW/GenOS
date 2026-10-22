'use strict';

const independenceFirewall = require('../firewalls/independenceFirewall');
const privacyFirewall = require('../firewalls/privacyFirewall');
const authorityFirewall = require('../firewalls/authorityFirewall');
const stateFirewall = require('../firewalls/stateFirewall');
const firewallManager = require('../firewalls/informationFirewallManager');

const INDEPENDENCE_FIREWALL = 'INDEPENDENCE';
const PRIVACY_FIREWALL = 'PRIVACY';
const AUTHORITY_FIREWALL = 'AUTHORITY';
const STATE_FIREWALL = 'STATE';

const FIREWALLS = Object.freeze({
  [INDEPENDENCE_FIREWALL]: independenceFirewall,
  [PRIVACY_FIREWALL]: privacyFirewall,
  [AUTHORITY_FIREWALL]: authorityFirewall,
  [STATE_FIREWALL]: stateFirewall
});

function enforceIndependence(graph, edge) {
  return independenceFirewall.permitsCommunication(graph, edge);
}

function enforcePrivacy(graph, edge, levels) {
  return privacyFirewall.permitsFlow(graph, edge, levels);
}

function enforceAuthority(graph, edge, actions) {
  return authorityFirewall.filterActions(graph, edge, actions);
}

function enforceState(graph, edge) {
  return stateFirewall.permitsSharedState(graph, edge);
}

function enforceAll(graph, edge, context) {
  const ctx = context || {};
  return {
    [INDEPENDENCE_FIREWALL]: enforceIndependence(graph, edge),
    [PRIVACY_FIREWALL]: enforcePrivacy(graph, edge, ctx.privacyLevels),
    [AUTHORITY_FIREWALL]: enforceAuthority(graph, edge, ctx.actions),
    [STATE_FIREWALL]: enforceState(graph, edge)
  };
}

module.exports = {
  INDEPENDENCE_FIREWALL,
  PRIVACY_FIREWALL,
  AUTHORITY_FIREWALL,
  STATE_FIREWALL,
  FIREWALLS,
  createFirewallEdge: firewallManager.createFirewallEdge,
  attachFirewall: firewallManager.attachFirewall,
  hasFirewall: firewallManager.hasFirewall,
  enforceIndependence,
  enforcePrivacy,
  enforceAuthority,
  enforceState,
  enforceAll
};

'use strict';

/**
 * DegradedMode : dégrader plutôt que crasher (frontier -> local, etc.).
 */

const MODES = {
  full: { model: 'frontier', scope: 'full', network: 'on' },
  reduced_model: { model: 'local', scope: 'full', network: 'on' },
  narrower_scope: { model: 'local', scope: 'narrow', network: 'on' },
  silent_network: { model: 'local', scope: 'narrow', network: 'off' }
};

function degrade(opts) {
  const o = opts || {};
  const mode = MODES[o.mode] ? o.mode : 'reduced_model';
  return { mode, ...MODES[mode], reason: o.reason || 'substrate_failure', at: new Date().toISOString() };
}

module.exports = { degrade, MODES };

'use strict';

const { baseDossier } = require('./dossier');

function create(topology, reason = 'topology_completion_adapter_unavailable') {
  return Object.freeze({ id: `${topology}-completion-pending`, topology, specialized: false,
    async build(input) {
      return { ...baseDossier(input), topologyValidation: { status: 'partial', reasons: [reason] },
        invariants: [], oracle: null };
    } });
}

module.exports = { create };

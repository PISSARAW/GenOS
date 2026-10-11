'use strict';

async function resolve(db, options) {
  if (!options.agentId && !options.runId) return null;
  if (!options.agentId || !options.runId) {
    throw Object.assign(new Error('Claim producer requires a sealed agent run.'), {
      code: 'EPISTEMIC_PRODUCER_AUTHORITY_REQUIRED'
    });
  }
  const result = await require('../missionEnvelopeAuthority').assertRun(db, {
    agentId: options.agentId, runId: options.runId
  });
  if (result.status !== 'authorized') {
    throw Object.assign(new Error('Claim producer has no bound authority.'), {
      code: 'EPISTEMIC_PRODUCER_AUTHORITY_REQUIRED'
    });
  }
  return { agentId: options.agentId, runId: options.runId, authorityHash: result.hash };
}

module.exports = { resolve };

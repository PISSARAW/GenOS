'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const dialect = require('../communication/dialectService');
const ground = require('../communication/commonGroundService');

const DOMAIN = 'mission-worker-context/v1';
const provenance = { kind: 'installed-mission-context-schema', strength: 'configured' };

function operations() {
  return ['put', 'remove'].map(kind => ({ kind, semanticFingerprint: digest(`mission-context.${kind}/v1`),
    canonicalMeaning: `mission-context.${kind}/v1`, payloadSchema: { type: 'object', additionalProperties: false,
      required: kind === 'put' ? ['key', 'value'] : ['key'],
      properties: kind === 'put' ? { key: { const: 'task' }, value: { type: 'string', maxLength: 262144 } }
        : { key: { const: 'task' } } } }));
}

function configuration(db) {
  return { db, schema: { schemaId: DOMAIN, version: '1', definition: { type: 'object', additionalProperties: false,
    required: ['task', 'missionId', 'runId'], properties: { task: { type: 'string', maxLength: 262144 },
      missionId: { type: 'string' }, runId: { type: 'string' } } } }, operations: operations(),
  groundingProvenance: provenance };
}

async function install(db, actors) {
  const created = await dialect.createDialect({ db, participants: actors.map(actor => actor.agentId), domain: DOMAIN });
  const held = await dialect.getDialect({ db, dialectId: created.dialectId });
  for (const [index, operation] of operations().entries()) {
    const symbol = index ? 'R' : 'P';
    if (!held.symbols[symbol]) await dialect.defineSymbol({ db, dialectId: created.dialectId, symbol, ...operation });
    else if (digest([held.symbols[symbol].semanticFingerprint, held.symbols[symbol].canonicalMeaning, held.symbols[symbol].payloadSchema])
      !== digest([operation.semanticFingerprint, operation.canonicalMeaning, operation.payloadSchema])) throw new Error('Mission SYNAPSE installed dictionary changed.');
    const shared = await ground.getSharedGround({ db, agentA: actors[0].agentId, agentB: actors[1].agentId, domain: DOMAIN });
    if (!shared.some(entry => entry.semanticFingerprint === operation.semanticFingerprint)) {
      await ground.recordGrounding({ db, agentA: actors[0].agentId, agentB: actors[1].agentId, domain: DOMAIN,
        semanticFingerprint: operation.semanticFingerprint, status: 'grounded', confidence: 1, provenance });
    }
  }
  return created.dialectId;
}

module.exports = { DOMAIN, configuration, install };

'use strict';

const dialects = require('../../src/services/communication/dialectService');
const ground = require('../../src/services/communication/commonGroundService');
const fixture = require('./synapseProcessFixtures.cjs');
const { createContextCodec } = require('../../src/services/synapseProtocol/contextCodec');
const { withTransaction } = require('../../src/db');

async function installPair(db, receiver, role) {
  const dialect = await dialects.createDialect({ db, participants: ['source', receiver], domain: 'epistemic' });
  for (const operation of fixture.OPERATIONS) {
    await dialects.defineSymbol({ db, dialectId: dialect.dialectId, symbol: operation.kind === 'put' ? 'p' : 'r',
      semanticFingerprint: operation.semanticFingerprint, canonicalMeaning: operation.canonicalMeaning,
      payloadSchema: operation.payloadSchema });
    await ground.recordGrounding({ db, agentA: 'source', agentB: receiver, domain: 'epistemic',
      semanticFingerprint: operation.semanticFingerprint, status: 'grounded', confidence: 0.8,
      provenance: { ...fixture.PROVENANCE, evidenceRef: `${role}:local-install` } });
  }
}

async function bootstrap(runtime, role) {
  const db = runtime.db;
  await db.exec('CREATE TABLE IF NOT EXISTS synapse_demo_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await withTransaction(db, async () => {
    if (await db.get('SELECT value FROM synapse_demo_settings WHERE name = ?', 'installed')) return;
    for (const receiver of role === 'source' ? ['receiver-a', 'receiver-b'] : [role]) await installPair(db, receiver, role);
    await db.run('INSERT INTO synapse_demo_settings(name,value) VALUES (?,?)', 'installed', 'true');
  });
}

async function plan(runtime, request) {
  const state = await runtime.state(request.query);
  const context = await runtime.captureContext(request.query);
  const operations = request.review ? fixture.REVIEW : fixture.CHANGES;
  const codec = createContextCodec({ db: runtime.db, schema: fixture.SCHEMA,
    operations: fixture.OPERATIONS, groundingProvenance: fixture.PROVENANCE });
  const built = codec.createDelta({ deltaId: request.deltaId, context, operations, state: state.value });
  return { context, delta: built.delta, canonical: built.representation,
    dialect: await codec.encode({ context, operations }) };
}

async function changeDictionary(runtime, query) {
  const input = fixture.localInput(query, await runtime.state(query));
  const before = await dialects.getDialect({ db: runtime.db, dialectId: input.dialectId });
  const spec = fixture.OPERATIONS[0];
  const after = await dialects.defineSymbol({ db: runtime.db, dialectId: input.dialectId, symbol: 'p',
    semanticFingerprint: spec.semanticFingerprint, canonicalMeaning: 'receiver-b.changed-meaning', payloadSchema: spec.payloadSchema });
  return { before, after };
}

module.exports = { bootstrap, plan, changeDictionary };

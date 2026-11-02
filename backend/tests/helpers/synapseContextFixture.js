'use strict';

const Database = require('better-sqlite3');
const dialect = require('../../src/services/communication/dialectService');
const ground = require('../../src/services/communication/commonGroundService');
const { createContextCodec } = require('../../src/services/synapseProtocol/contextCodec');
const contract = require('./synapseContractFixture');

const parameters = values => values.length === 1 && Array.isArray(values[0]) ? values[0] : values;

function createDatabase(filename = ':memory:') {
  const raw = new Database(filename);
  raw.pragma('journal_mode=WAL');
  return { raw, db: { exec: async sql => raw.exec(sql),
    get: async (sql, ...values) => raw.prepare(sql).get(...parameters(values)),
    all: async (sql, ...values) => raw.prepare(sql).all(...parameters(values)),
    run: async (sql, ...values) => raw.prepare(sql).run(...parameters(values)) } };
}

function configuration(db, overrides = {}) {
  return { db, schema: contract.schemaConfiguration(), operations: contract.operationConfigurations(),
    groundingProvenance: contract.groundingProvenance, clock: () => contract.NOW, ...overrides };
}

async function install(db, evidenceRef = 'local-contract') {
  const created = await dialect.createDialect({ db, participants: ['sender', 'receiver'], domain: 'counter' });
  for (const [index, entry] of contract.operationConfigurations().entries()) {
    await dialect.defineSymbol({ db, dialectId: created.dialectId, symbol: index ? 'R' : 'P',
      semanticFingerprint: entry.semanticFingerprint, canonicalMeaning: entry.canonicalMeaning, payloadSchema: entry.payloadSchema });
    await ground.recordGrounding({ db, agentA: 'sender', agentB: 'receiver', domain: 'counter',
      semanticFingerprint: entry.semanticFingerprint, status: 'grounded', confidence: 1,
      provenance: { ...contract.groundingProvenance, evidenceRef } });
  }
  return created.dialectId;
}

async function setup(options = {}) {
  const database = createDatabase(options.dbPath);
  const dialectId = await install(database.db, options.evidenceRef);
  const codec = createContextCodec(configuration(database.db, options.codec));
  const local = { contextId: 'context-1', dialectId, domain: 'counter', publisher: contract.actor('sender'),
    audience: [contract.actor('receiver')], state: contract.state(), generation: 0,
    dependencies: [{ dependencyId: 'workflow', digest: require('../../src/services/evidenceProtocol/canonical').digest('workflow-v1') }] };
  return { ...database, codec, local, close: () => database.raw.close() };
}

async function offer(source) {
  const context = await source.codec.capture(source.local);
  const committed = source.codec.createDelta({ deltaId: 'delta-1', context,
    operations: contract.operations(), state: source.local.state });
  return { context, delta: committed.delta, canonical: committed.representation,
    representation: await source.codec.encode({ context, operations: contract.operations() }) };
}

module.exports = { ...contract, createDatabase, configuration, install, setup, offer };

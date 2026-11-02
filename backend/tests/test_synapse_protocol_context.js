'use strict';

const assert = require('node:assert/strict');
const dialect = require('../src/services/communication/dialectService');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { createContextCodec } = require('../src/services/synapseProtocol/contextCodec');
const fixture = require('./helpers/synapseContextFixture');

async function qualify(receiver, offer, overrides = {}) {
  return receiver.codec.qualify({ context: offer.context, delta: offer.delta,
    representation: offer.representation, local: receiver.local, ...overrides });
}

async function fullNativeRoundTrip() {
  const source = await fixture.setup({ evidenceRef: 'source-independent-history' });
  const receiver = await fixture.setup({ evidenceRef: 'receiver-independent-history' });
  try {
    receiver.raw.prepare(`UPDATE communication_common_ground SET grounded_at='2026-11-01 09:00:00', last_confirmed_at='2026-11-02 09:00:00'`).run();
    const offered = await fixture.offer(source);
    const decoded = await qualify(receiver, offered);
    assert.equal(decoded.compatible, true);
    assert.deepEqual(decoded.operations, fixture.operations());
    assert.deepEqual(decoded.value, { counter: 1 });
    assert.notEqual(digest(decoded.context.grounding), digest(offered.context.grounding));
    assert.deepEqual(receiver.local.state, fixture.state());
    const native = await dialect.decode({ db: receiver.db, dialectId: receiver.local.dialectId, symbol: 'P', version: 3 });
    assert.equal(native.canonicalMeaning, 'synapse.put/v1');
  } finally { source.close(); receiver.close(); }
}

async function nativeHashDoesNotBindMeaning() {
  const source = await fixture.setup(); const receiver = await fixture.setup();
  try {
    const offered = await fixture.offer(source);
    const before = await dialect.getDialect({ db: receiver.db, dialectId: receiver.local.dialectId });
    receiver.raw.prepare('UPDATE dialect_symbols SET canonical_meaning=? WHERE dialect_id=? AND symbol=?')
      .run('different-meaning', receiver.local.dialectId, 'P');
    const after = await dialect.getDialect({ db: receiver.db, dialectId: receiver.local.dialectId });
    assert.equal(after.commonGroundHash, before.commonGroundHash);
    assert.equal(after.version, before.version);
    const rejected = await qualify(receiver, offered);
    assert.equal(rejected.compatible, false); assert.deepEqual(rejected.missing, ['dictionary']);
    assert.equal(rejected.canonicalRequested, true);
    const canonical = await qualify(receiver, offered, { representation: offered.canonical });
    assert.equal(canonical.compatible, true); assert.deepEqual(canonical.value, { counter: 1 });
  } finally { source.close(); receiver.close(); }
}

async function schemaHashDoesNotBindPayload() {
  const source = await fixture.setup(); const receiver = await fixture.setup();
  try {
    const offered = await fixture.offer(source);
    const original = await dialect.getDialect({ db: receiver.db, dialectId: receiver.local.dialectId });
    receiver.raw.prepare('UPDATE dialect_symbols SET payload_schema_json=? WHERE dialect_id=? AND symbol=?')
      .run(JSON.stringify({ type: 'object', required: ['invented'] }), receiver.local.dialectId, 'P');
    const changed = await dialect.getDialect({ db: receiver.db, dialectId: receiver.local.dialectId });
    assert.equal(changed.commonGroundHash, original.commonGroundHash);
    assert.equal((await qualify(receiver, offered)).canonicalRequested, true);
    assert.equal((await qualify(receiver, offered, { representation: offered.canonical })).compatible, true);
  } finally { source.close(); receiver.close(); }
}

async function missingDictionaryAndSymbol() {
  const source = await fixture.setup(); const receiver = await fixture.setup();
  try {
    const offered = await fixture.offer(source);
    const unknown = { encoding: 'dialect', operations: [{ symbol: 'UNKNOWN', payload: { key: 'counter', value: 1 } }] };
    assert.equal((await qualify(receiver, offered, { representation: unknown })).canonicalRequested, true);
    receiver.raw.prepare('DELETE FROM dialects WHERE dialect_id=?').run(receiver.local.dialectId);
    const missing = await qualify(receiver, offered);
    assert.equal(missing.compatible, false); assert.equal(missing.canonicalRequested, true);
    assert.equal((await qualify(receiver, offered, { representation: offered.canonical })).compatible, true);
  } finally { source.close(); receiver.close(); }
}

async function mandatoryBindings() {
  const source = await fixture.setup(); const receiver = await fixture.setup();
  try {
    const offered = await fixture.offer(source);
    const changes = [
      { ...receiver.local, state: { counter: 7, note: 'old' }, generation: 1 },
      { ...receiver.local, dependencies: [{ dependencyId: 'workflow', digest: digest('changed') }] },
      { ...receiver.local, audience: [{ ...fixture.actor('receiver'), incarnationId: 'receiver-2' }] },
    ];
    for (const local of changes) {
      const result = await qualify(receiver, offered, { representation: offered.canonical, local });
      assert.equal(result.compatible, false); assert.equal(result.canonicalRequested, false);
    }
    const schema = fixture.schemaConfiguration(); schema.version = '2';
    const other = createContextCodec(fixture.configuration(receiver.db, { schema }));
    const result = await other.qualify({ context: offered.context, delta: offered.delta,
      representation: offered.canonical, local: receiver.local });
    assert.deepEqual(result.missing, ['schema']);
  } finally { source.close(); receiver.close(); }
}

async function groundCannotBeBypassed() {
  const source = await fixture.setup(); const receiver = await fixture.setup();
  try {
    const offered = await fixture.offer(source);
    receiver.raw.prepare("UPDATE communication_common_ground SET status='revoked'").run();
    const result = await qualify(receiver, offered, { representation: offered.canonical });
    assert.equal(result.compatible, false); assert.deepEqual(result.missing, ['grounding']);
    assert.equal(result.canonicalRequested, false);
  } finally { source.close(); receiver.close(); }
}

async function exactCommitmentAndLocalSchema() {
  const source = await fixture.setup(); const receiver = await fixture.setup();
  try {
    const offered = await fixture.offer(source);
    const changed = { encoding: 'canonical', operations: [{ kind: 'put', key: 'counter', value: 99 }, { kind: 'remove', key: 'note' }] };
    await assert.rejects(qualify(receiver, offered, { representation: changed }), /operation digest mismatch/);
    await assert.rejects(qualify(receiver, offered, { delta: { ...offered.delta, targetDigest: digest('other') } }), /target state digest/);
    assert.throws(() => source.codec.createDelta({ deltaId: 'bad', context: offered.context, state: source.local.state,
      operations: [{ kind: 'put', key: 'counter', value: 'not-an-integer' }] }), /locally installed schema/);
    assert.throws(() => source.codec.createDelta({ deltaId: 'bad', context: offered.context, state: source.local.state,
      operations: [{ kind: 'remove', key: 'absent' }] }), /absent key/);
    assert.throws(() => source.codec.createDelta({ deltaId: 'bad', context: offered.context, state: source.local.state,
      operations: [{ kind: 'put', key: 'counter', value: 1 }, { kind: 'remove', key: 'counter' }] }), /one operation per key/);
  } finally { source.close(); receiver.close(); }
}

async function main() {
  await fullNativeRoundTrip();
  await nativeHashDoesNotBindMeaning();
  await schemaHashDoesNotBindPayload();
  await missingDictionaryAndSymbol();
  await mandatoryBindings();
  await groundCannotBeBypassed();
  await exactCommitmentAndLocalSchema();
  console.log('SYNAPSE native dialect/full snapshots, common ground and canonical fallback without guessing: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

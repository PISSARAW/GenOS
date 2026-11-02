'use strict';

const { validateMessage } = require('./contract');
const { validateWorld, qualifyWorld } = require('./qualification');
const { immutable } = require('../evidenceProtocol/conversation');
const { migrateGqwf } = require('../gqwf/schema');
const { ExchangeStore } = require('./exchangeStore');
const { CasAdapter } = require('./casAdapter');
const { decodeBase64 } = require('./casSafety');
const bindings = require('./exchangeBindings');
const { withTransaction } = require('../../db');

class GqwfExchange {
  constructor(options) {
    if (typeof options.authorize !== 'function') throw new Error('GQWF Exchange trusted authorize callback required.');
    if (options.verifyWorld !== undefined && typeof options.verifyWorld !== 'function') throw new Error('GQWF Exchange world verifier must be a function.');
    this.cas = new CasAdapter(options.workspaceRoot);
    this.workspacePath = this.cas.root;
    this.store = new ExchangeStore(options.dbPath || ':memory:');
    this.db = this.store.db;
    this.authorize = options.authorize;
    this.verifyWorld = options.verifyWorld;
    this.clock = options.clock || (() => Date.now());
    this.ready = migrateGqwf(this.db);
  }

  close() { this.store.close(); }
  async assertSafeCas() { await this.cas.prepare(); }

  async allowed(operation, request) {
    if (await this.authorize(immutable({ operation, request })) !== true) throw new Error('GQWF Exchange authority rejected or revoked.');
  }

  async physical(state, metadata) {
    validateWorld(state.world);
    for (const blob of bindings.blobs(state.world)) await this.cas.read(blob);
    if (metadata) {
      if (await this.cas.readMetadata(state.world.rootHash) !== state.world.manifestSerialized) throw new Error('GQWF Exchange root metadata changed.');
      if (await this.cas.readMetadata(state.world.closureHash) !== state.world.closureSerialized) throw new Error('GQWF Exchange closure metadata changed.');
      if (metadata === true) await withTransaction(this.db, async () => this.store.checkIndexes(state));
    }
  }

  async externalVerification(state, qualification) {
    if (!this.verifyWorld) return null;
    const request = bindings.verificationRequest(state, qualification);
    const receipt = await this.verifyWorld(immutable(request));
    if (!bindings.verified(receipt, request)) throw new Error('GQWF Exchange world verification receipt mismatch.');
    return structuredClone(receipt);
  }

  async apply(input) {
    await this.ready;
    const message = validateMessage(input, { now: this.clock() });
    if (!['OFFER_WORLD', 'NEED_OBJECTS', 'TRANSFER', 'VERIFY_WORLD'].includes(message.type)) throw new Error('GQWF Exchange transfer message unsupported.');
    await this.allowed('APPLY', message);
    const binding = bindings.query(message);
    const { expected, replay } = await this.store.snapshot(binding, message);
    if (replay) {
      await this.allowed('APPLY', message);
      if (message.type === 'VERIFY_WORLD') await this.physical(expected, true);
      validateMessage(message, { now: this.clock() });
      return replay;
    }
    const state = await this.transition(message, expected);
    await this.allowed('APPLY', message);
    validateMessage(message, { now: this.clock() });
    if (state.status === 'verified') await this.physical(state, 'staged');
    state.revision += 1;
    state.lastMessageId = message.messageId;
    const result = { status: state.status, ...state.query, revision: state.revision, messageId: message.messageId };
    if (message.type === 'NEED_OBJECTS') result.objects = state.needed;
    if (state.receipt) result.receipt = state.receipt;
    const validate = () => {
      validateMessage(message, { now: this.clock() });
      validateMessage(state.offerMessage, { now: this.clock() });
    };
    return this.store.commit({ message, expected, state, result, root: this.workspacePath, validate,
      authorize: () => this.allowed('APPLY', message),
      revalidate: async () => { if (state.status === 'verified') await this.physical(state, 'staged'); } });
  }

  async transition(message, expected) {
    if (message.type === 'OFFER_WORLD') {
      if (expected) throw new Error('GQWF Exchange world already offered.');
      const world = validateWorld(message.payload.world);
      bindings.blobs(world);
      return { query: bindings.query(message), context: bindings.context(message), offerMessage: message,
        world, status: 'offered', revision: 0, needed: [], received: [] };
    }
    bindings.requireMessage(expected, message);
    validateMessage(expected.offerMessage, { now: this.clock() });
    const state = structuredClone(expected);
    if (message.type === 'NEED_OBJECTS') return this.need(state);
    if (message.type === 'TRANSFER') return this.transfer(message, state);
    return this.verify(state);
  }

  async need(state) {
    if (!['offered', 'requested', 'transferring'].includes(state.status)) throw new Error('GQWF Exchange NEED_OBJECTS out of order.');
    const needed = [];
    for (const blob of bindings.blobs(state.world)) if (!await this.cas.has(blob)) needed.push(blob);
    state.needed = needed;
    state.status = 'requested';
    return state;
  }

  async transfer(message, state) {
    if (!['requested', 'transferring'].includes(state.status)) throw new Error('GQWF Exchange TRANSFER requires requested objects.');
    const blob = state.needed.find((item) => item.hash === message.payload.hash);
    if (!blob || state.received.includes(blob.hash)) throw new Error('GQWF Exchange unrequested or already received object.');
    await this.cas.put(blob, decodeBase64(message.payload.bytesBase64));
    state.received.push(blob.hash);
    state.status = 'transferring';
    return state;
  }

  async verify(state) {
    if (!['requested', 'transferring'].includes(state.status)) throw new Error('GQWF Exchange VERIFY_WORLD requires object negotiation.');
    await this.physical(state, false);
    state.qualification = qualifyWorld(state.world);
    state.verification = await this.externalVerification(state, state.qualification);
    await this.physical(state, false);
    await this.cas.metadata(state.world.rootHash, state.world.manifestSerialized);
    await this.cas.metadata(state.world.closureHash, state.world.closureSerialized);
    state.receipt = bindings.receipt(state, state.qualification);
    state.status = 'verified';
    return state;
  }

  async describe(query) {
    await this.ready;
    await this.allowed('DESCRIBE_WORLD', query);
    return withTransaction(this.db, () => this.describeSnapshot(query));
  }

  async describeSnapshot(query) {
    const state = this.store.state(query);
    bindings.requireState(state, query);
    await this.allowed('DESCRIBE_WORLD', query);
    return state;
  }

  async verifiedWorld(query) {
    await this.ready;
    await this.allowed('VERIFIED_WORLD', query);
    return withTransaction(this.db, () => this.verifiedSnapshot(query));
  }

  async verifiedSnapshot(query) {
    const state = this.store.state(query);
    bindings.requireState(state, query);
    if (state.status !== 'verified') throw new Error('GQWF Exchange world has not been physically verified.');
    await this.physical(state, true);
    const qualification = qualifyWorld(state.world);
    await this.externalVerification(state, qualification);
    await this.allowed('VERIFIED_WORLD', query);
    await this.physical(state, true);
    if (!bindings.same(state.receipt, bindings.receipt(state, qualification))) throw new Error('GQWF Exchange historical world receipt mismatch.');
    return { world: state.world, qualification, receipt: state.receipt };
  }

  async exportObjects(input) {
    await this.ready;
    await this.allowed('EXPORT_OBJECTS', input);
    return withTransaction(this.db, () => this.exportSnapshot(input));
  }

  async exportSnapshot(input) {
    const { hashes, ...query } = input;
    const state = this.store.state(query);
    bindings.requireState(state, query);
    if (!Array.isArray(hashes) || new Set(hashes).size !== hashes.length || hashes.length > 1000) throw new Error('GQWF Exchange export hashes invalid.');
    const declared = new Map(bindings.blobs(state.world).map((blob) => [blob.hash, blob]));
    const total = hashes.reduce((size, hash) => size + (declared.get(hash)?.size || 0), 0);
    if (total > 32 * 1024 * 1024) throw new Error('GQWF Exchange export batch exceeds byte bound.');
    const result = [];
    for (const hash of hashes) {
      const blob = declared.get(hash);
      if (!blob) throw new Error('GQWF Exchange export object is outside offered world.');
      const bytes = await this.cas.read(blob);
      result.push({ ...blob, bytesBase64: bytes.toString('base64') });
    }
    await this.allowed('EXPORT_OBJECTS', input);
    return result;
  }
}

module.exports = { GqwfExchange };

'use strict';

const { withTransaction } = require('../../db');
const { immutable } = require('../evidenceProtocol/conversation');
const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage, validateContext, validateState } = require('./contract');
const { ConversationStore } = require('./conversationStore');
const { ConversationPhases } = require('./conversationPhases');
const v = require('./conversationBindings');

class SynapseConversation {
  constructor(options) {
    for (const name of ['authorize', 'localContext']) {
      if (typeof options[name] !== 'function') throw new Error(`SYNAPSE ${name} trusted callback required.`);
    }
    v.actor(options.actor); v.authority(options.authority); v.generation(options.incarnationGeneration);
    this.actor = immutable(options.actor);
    this.authority = immutable(options.authority);
    this.incarnationGeneration = options.incarnationGeneration;
    this.authorize = options.authorize;
    this.localContext = options.localContext;
    this.clock = options.clock || (() => Date.now());
    this.store = new ConversationStore(options.dbPath || ':memory:');
    this.db = this.store.db;
    this.codec = typeof options.codec === 'function' ? options.codec(this.db) : options.codec;
    if (typeof this.codec?.capture !== 'function' || typeof this.codec?.qualify !== 'function') throw new Error('SYNAPSE installed native context codec required.');
    if (this.codec.db !== this.db) throw new Error('SYNAPSE codec must share the conversation SQLite connection.');
    this.phases = new ConversationPhases(this);
  }

  close() { this.store.close(); }

  async allowed(operation, request) {
    if (await this.authorize(immutable({ operation, request })) !== true) throw new Error('SYNAPSE authority rejected or revoked.');
  }

  validateFrames(message, dialogue) {
    validateMessage(message, { now: this.clock() });
    if (dialogue) validateMessage(dialogue.declaration, { now: this.clock() });
  }

  responseExpiry(message, dialogue) {
    return new Date(Math.min(Date.parse(message.expiresAt), Date.parse(dialogue.declaration.expiresAt))).toISOString();
  }

  async localInput(query, state) {
    if (!state) throw new Error('SYNAPSE local resource must be initialized by a trusted operator.');
    const input = v.copy(await this.localContext(immutable({ query, state })));
    if (input.contextId !== query.contextId || input.generation !== state.generation || !v.same(input.state, state.value)) {
      throw new Error('SYNAPSE local context provider does not describe the actual JSON resource.');
    }
    return input;
  }

  async initialize(inputQuery, input) {
    const query = v.documentQuery(inputQuery);
    v.exact(input, ['value', 'generation']); v.generation(input.generation);
    const value = validateState(input.value);
    await this.allowed('INITIALIZE', { query, value, generation: input.generation });
    return withTransaction(this.db, async () => {
      await this.allowed('INITIALIZE', { query, value, generation: input.generation });
      if (this.store.document(query)) throw new Error('SYNAPSE local resource already initialized.');
      const state = { value, stateDigest: digest(value), generation: input.generation };
      await this.codec.capture(await this.localInput(query, state));
      await this.allowed('INITIALIZE', { query, value, generation: input.generation });
      if (this.store.document(query)) throw new Error('SYNAPSE local resource changed during initialization.');
      this.store.writeDocument(query, state, null);
      return state;
    });
  }

  async replaceState(inputQuery, input) {
    const query = v.documentQuery(inputQuery);
    v.exact(input, ['value', 'expectedGeneration']); v.generation(input.expectedGeneration);
    const value = validateState(input.value);
    await this.allowed('REPLACE_STATE', { query, value, expectedGeneration: input.expectedGeneration });
    return withTransaction(this.db, async () => {
      const current = this.store.document(query);
      if (!current || current.generation !== input.expectedGeneration) throw new Error('SYNAPSE local replacement generation conflict.');
      const next = { value, stateDigest: digest(value), generation: current.generation + 1 };
      v.generation(next.generation);
      await this.codec.capture(await this.localInput(query, next));
      await this.allowed('REPLACE_STATE', { query, value, expectedGeneration: input.expectedGeneration });
      this.store.writeDocument(query, next, current);
      return next;
    });
  }

  async read(operation, query, reader) {
    await this.allowed(operation, query);
    return withTransaction(this.db, async () => {
      await this.allowed(operation, query);
      const value = await reader();
      await this.allowed(operation, query);
      return value;
    });
  }

  state(input) {
    const query = v.documentQuery(input);
    return this.read('STATE', query, async () => this.store.document(query));
  }

  captureContext(input) {
    const query = v.documentQuery(input);
    return this.read('CAPTURE_CONTEXT', query, async () => this.codec.capture(await this.localInput(query, this.store.document(query))));
  }

  outbox(input) {
    const query = v.documentQuery(input);
    return this.read('OUTBOX', query, async () => this.store.outbox(query));
  }

  transfer(input) {
    const query = v.deltaQuery(input);
    const transfer = this.store.transfer(query);
    if (!transfer || !v.same(transfer.query, query)) throw new Error('SYNAPSE delta scope or digest mismatch.');
    return transfer;
  }

  status(input) {
    const query = v.deltaQuery(input);
    return this.read('STATUS', query, async () => this.transfer(query));
  }

  subject(input) {
    const query = v.deltaQuery(input);
    return this.read('SUBJECT', query, async () => {
      const transfer = this.transfer(query);
      const dialogue = this.store.dialogue(transfer.documentQuery);
      return { context: dialogue.context, delta: transfer.delta, receiver: dialogue.context.audience[0] };
    });
  }

  receipt(input) {
    const query = v.deltaQuery(input);
    return this.read('RECEIPT', query, async () => {
      const transfer = this.transfer(query);
      const receipt = this.store.receipt(query);
      if (!receipt) return null;
      const dialogue = this.store.dialogue(transfer.documentQuery);
      const expected = v.receipt(transfer, dialogue, { messageId: transfer.applyMessageId });
      if (!v.same(expected, receipt)) throw new Error('SYNAPSE applied receipt binding mismatch.');
      this.store.assertReceipt(transfer.documentQuery, receipt);
      return receipt;
    });
  }

  async apply(input) {
    const message = validateMessage(input, { now: this.clock() });
    if (!['DECLARE_CONTEXT', 'OFFER_DELTA', 'REQUEST_MISSING', 'APPLY_DELTA', 'ACK_STATE'].includes(message.type)) {
      throw new Error('SYNAPSE conversation message unsupported.');
    }
    await this.allowed('APPLY', message);
    return withTransaction(this.db, async () => {
      await this.allowed('APPLY', message);
      this.validateFrames(message);
      const replay = this.store.replay(message);
      if (replay) return replay;
      const result = message.type === 'DECLARE_CONTEXT' ? this.declare(message) : await this.advance(message);
      this.validateFrames(message);
      this.store.record(message, result);
      return result;
    });
  }

  declare(message) {
    const context = validateContext(message.payload.context);
    const query = v.frameQuery(message, context.contextId);
    if (this.store.dialogue(query)) throw new Error('SYNAPSE context already declared in this conversation.');
    if (!this.store.document(query)) throw new Error('SYNAPSE local resource must be initialized before a declaration.');
    const dialogue = { query, context, contextDigest: digest(context), declaration: message };
    v.requireFrame(dialogue, message, this.actor);
    if (v.same(message.sender, this.actor)) this.localFrame(message);
    this.store.writeDialogue(dialogue);
    return { status: 'declared', contextId: context.contextId, contextDigest: dialogue.contextDigest, outbound: [] };
  }

  localFrame(message) {
    if (message.generations.incarnation !== this.incarnationGeneration || !v.same(message.authority, this.authority)) {
      throw new Error('SYNAPSE local envelope authority or incarnation generation mismatch.');
    }
  }

  async advance(message) {
    const change = this.phases.locate(message);
    v.requireFrame(change.dialogue, message, this.actor);
    this.validateFrames(message, change.dialogue);
    if (v.same(message.sender, this.actor)) this.localFrame(message);
    let result;
    if (message.type === 'OFFER_DELTA') result = await this.phases.offer(message, change);
    else if (message.type === 'APPLY_DELTA') result = await this.phases.applyDelta(message, change);
    else result = this.phases.reverse(message, change);
    this.validateFrames(message, change.dialogue);
    this.store.writeDialogue(change.dialogue);
    this.store.writeTransfer(change.transfer);
    return { ...result, ...change.transfer.query };
  }
}

module.exports = { SynapseConversation };

'use strict';

const { validateMessage } = require('./contract');
const { verifyConservation } = require('./conservation');
const { immutable } = require('../evidenceProtocol/conversation');
const { digest } = require('../evidenceProtocol/canonical');
const { CoordinatorStore } = require('./coordinatorStore');
const bindings = require('./coordinatorBindings');

function requireCallbacks(options) {
  for (const name of ['authorize', 'verifyCheckpoint', 'verifyReady', 'verifyApplied']) {
    if (typeof options[name] !== 'function') throw new Error(`MORPH ${name} callback required.`);
  }
}

class MorphCoordinator {
  constructor(options) {
    requireCallbacks(options);
    this.store = new CoordinatorStore(options.dbPath || ':memory:');
    this.authorize = options.authorize;
    this.verifyCheckpoint = options.verifyCheckpoint;
    this.verifyReady = options.verifyReady;
    this.verifyApplied = options.verifyApplied;
    this.clock = options.clock || (() => new Date().toISOString());
  }

  state(id) { return this.store.state(id); }
  history() { return this.store.history(); }
  close() { this.store.close(); }

  decision(query) {
    const state = this.state(query.transitionId);
    if (!state || !bindings.same(query, bindings.query(state))) return null;
    return this.store.decision(query.transitionId);
  }

  async authorized(message) {
    if (await this.authorize(immutable(message)) !== true) throw new Error('MORPH coordinator authority rejected or revoked.');
  }

  async apply(input) {
    const message = validateMessage(input, { now: this.clock() });
    await this.authorized(message);
    const replay = this.store.replay(message);
    if (replay) return replay;
    const id = message.type === 'PROPOSE' ? message.payload.plan.transitionId : message.payload.transitionId;
    const expected = this.state(id);
    const transition = await this.transition(message, expected);
    await this.authorized(message);
    validateMessage(message, { now: this.clock() });
    transition.state.revision += 1;
    transition.state.lastMessageId = message.messageId;
    const result = { transitionId: id, status: transition.state.status, planDigest: transition.state.planDigest,
      revision: transition.state.revision, messageId: message.messageId };
    return this.store.commit({ message, expected, ...transition, result });
  }

  async transition(message, expected) {
    if (message.type === 'PROPOSE') return { state: this.propose(message, expected) };
    if (!expected) throw new Error('MORPH unknown transition.');
    bindings.requireContext(expected, message);
    const state = structuredClone(expected);
    if (['READY', 'REJECT'].includes(message.type)) return this.participant(message, state);
    bindings.requireCoordinator(state, message);
    return this.advance(message, state);
  }

  propose(message, expected) {
    if (expected) throw new Error('MORPH transition already exists.');
    const plan = message.payload.plan;
    verifyConservation(plan);
    if (!bindings.same(message.sender, plan.coordinator) || !bindings.same(message.audience, plan.coordinator)) {
      throw new Error('MORPH proposal coordinator identity or audience mismatch.');
    }
    if (message.generations.organization !== plan.sourceVersion) throw new Error('MORPH proposal source version mismatch.');
    return { transitionId: plan.transitionId, plan, planDigest: digest(plan), checkpointDigest: digest(plan.sourceSnapshot),
      context: bindings.context(message), status: 'proposed', revision: 0, ready: {},
      coordinatorIncarnationGeneration: message.generations.incarnation };
  }

  async advance(message, state) {
    const handlers = { QUIESCE: this.quiesce, CHECKPOINT: this.checkpoint, PREPARE: this.prepare,
      COMMIT: this.commit, ABORT: this.abort, FINALIZE: this.finalize, RECOVERY_REQUIRED: this.recovery };
    const handler = handlers[message.type];
    if (!handler) throw new Error('MORPH unsupported coordinator transition.');
    return handler.call(this, message, state);
  }

  quiesce(message, state) {
    if (state.status !== 'proposed') throw new Error('MORPH QUIESCE out of order.');
    state.status = 'quiescing';
    return { state };
  }

  async checkSource(state, stage) {
    const request = bindings.checkpointRequest(state, stage);
    const receipt = await this.verifyCheckpoint(immutable(request));
    if (!bindings.validCheckpoint(receipt, request)) throw new Error('MORPH checkpoint receipt mismatch.');
    return structuredClone(receipt);
  }

  async checkpoint(message, state) {
    if (state.status !== 'quiescing') throw new Error('MORPH CHECKPOINT requires quiescence intent.');
    state.checkpointReceipt = await this.checkSource(state, 'CHECKPOINT');
    state.status = 'checkpointed';
    return { state };
  }

  async prepare(message, state) {
    if (state.status !== 'checkpointed') throw new Error('MORPH PREPARE requires checkpoint.');
    verifyConservation(state.plan);
    state.prepareReceipt = await this.checkSource(state, 'PREPARE');
    state.prepareMessageId = message.messageId;
    state.status = 'prepared';
    return { state, ensureSource: true };
  }

  async participant(message, state) {
    const participant = bindings.member(state, message);
    if (message.type === 'REJECT') {
      if (state.committedDecision || ['aborted', 'rejected'].includes(state.status)) throw new Error('MORPH cannot reject terminated transition.');
      state.status = 'rejected';
      state.reason = message.payload.reason;
      return { state, decision: bindings.decision(state, 'ABORT') };
    }
    if (!['prepared', 'ready'].includes(state.status)) throw new Error('MORPH participant response requires prepared transition.');
    const expected = bindings.participantReceipt(state, participant, 'ready');
    if (message.payload.receiptDigest !== expected.receiptDigest) throw new Error('MORPH READY receipt digest mismatch.');
    const receipt = await this.verifyReady(immutable({ query: bindings.query(state), participant, receiptDigest: message.payload.receiptDigest }));
    if (!bindings.same(receipt, expected)) throw new Error('MORPH READY receipt not independently verified.');
    state.ready[digest(participant)] = structuredClone(receipt);
    if (Object.keys(state.ready).length === state.plan.participants.length) state.status = 'ready';
    return { state };
  }

  async commit(message, state) {
    if (state.status !== 'ready') throw new Error('MORPH COMMIT requires every fixed participant READY.');
    verifyConservation(state.plan);
    state.commitReceipt = await this.checkSource(state, 'COMMIT');
    state.committedDecision = bindings.decision(state, 'COMMIT');
    state.status = 'committed';
    return { state, advanceOrganization: true, decision: state.committedDecision };
  }

  abort(message, state) {
    if (state.committedDecision) throw new Error('MORPH cannot abort irreversible COMMIT.');
    if (['aborted', 'rejected'].includes(state.status)) throw new Error('MORPH transition already terminated.');
    state.status = 'aborted';
    return { state, decision: bindings.decision(state, 'ABORT') };
  }

  recovery(message, state) {
    if (!state.committedDecision || state.status === 'finalized') throw new Error('MORPH recovery requires unfinished COMMIT.');
    state.status = 'recovery_required';
    state.reason = message.payload.reason;
    return { state };
  }

  async finalize(message, state) {
    if (!['committed', 'recovery_required'].includes(state.status)) throw new Error('MORPH FINALIZE requires COMMIT.');
    const requests = state.plan.participants.map((participant) => ({ query: bindings.query(state), participant }));
    const receipts = await Promise.all(requests.map((request) => this.verifyApplied(immutable(request))));
    for (let index = 0; index < requests.length; index += 1) {
      if (!bindings.same(receipts[index], bindings.participantReceipt(state, requests[index].participant, 'applied'))) {
        throw new Error('MORPH participant application missing or mismatched; recovery required.');
      }
    }
    state.appliedReceipts = structuredClone(receipts);
    state.status = 'finalized';
    return { state };
  }
}

module.exports = { MorphCoordinator };

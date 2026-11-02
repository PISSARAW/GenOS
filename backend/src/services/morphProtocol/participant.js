'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { ParticipantStore } = require('./participantStore');
const { verifyConservation } = require('./conservation');
const access = require('./participantAccess');
const v = require('./participantValidation');

function callbacks(options) {
  for (const name of ['authorize', 'verifyDecision', 'verifyCheckpoint']) {
    if (typeof options[name] !== 'function') throw new Error(`MORPH trusted ${name} callback required.`);
  }
}

class MorphParticipant {
  constructor(options) {
    callbacks(options);
    Object.defineProperty(this, 'participant', { value: v.frozen(v.actor(v.copy(options.participantId))), enumerable: true });
    this.authorize = options.authorize;
    this.verifyDecision = options.verifyDecision;
    this.verifyCheckpoint = options.verifyCheckpoint;
    this.store = new ParticipantStore(options.dbPath || ':memory:', this.participant);
  }

  async authorized(action, request) {
    if (await this.authorize(v.frozen({ action, request, participant: this.participant })) !== true) {
      throw new Error('MORPH participant authorization rejected or revoked.');
    }
  }

  status(context) { return this.store.state(v.scope(v.copy(context.scope))); }
  readyReceipt(query) { return this.store.receipt('ready', v.query(query)); }
  receipt(query) {
    const binding = v.query(query);
    return this.store.receipt('applied', binding) || this.store.receipt('ready', binding);
  }
  close() { this.store.close(); }

  async bootstrap(context, snapshot) {
    const state = v.bootstrap(context, snapshot);
    await this.authorized('bootstrap', state);
    return this.store.atomic(() => {
      if (this.store.state(state.scope)) throw new Error('MORPH participant already bootstrapped.');
      this.store.save(state);
      return v.copy(state);
    });
  }

  async quiesce(input) {
    const prepared = v.prepared(input);
    verifyConservation(prepared.plan);
    if (!prepared.plan.participants.some(actor => v.same(actor, this.participant))) throw new Error('MORPH participant absent from plan.');
    await this.authorized('quiesce', { ...prepared.query, plan: prepared.plan });
    return this.store.atomic(() => this.freeze(prepared));
  }

  freeze(prepared) {
    this.store.bind(prepared.query);
    if (this.store.receipt('applied', prepared.query) || this.store.receipt('aborted', prepared.query)) {
      throw new Error('MORPH transition already resolved.');
    }
    const state = this.store.state(prepared.query.scope);
    if (!state) throw new Error('MORPH participant uninitialized.');
    if (state.transition && !v.same(state.transition.query, prepared.query)) throw new Error('MORPH participant transition conflict.');
    if (state.version !== prepared.query.sourceVersion || !v.same(state.snapshot, prepared.plan.sourceSnapshot)) {
      throw new Error('MORPH stale source snapshot or organization version.');
    }
    if (state.phase === 'active') {
      state.phase = 'quiesced';
      state.transition = prepared;
      this.store.save(state);
    }
    return { status: state.phase, ...prepared.query, participant: this.participant };
  }

  async prepare(input) {
    const prepared = v.prepared(input);
    const validated = { ...prepared.query, plan: prepared.plan };
    await this.quiesce(validated);
    const prior = this.store.receipt('ready', prepared.query);
    if (prior) return prior;
    const expected = this.store.state(prepared.query.scope);
    const request = { query: prepared.query, participant: this.participant,
      sourceSnapshot: prepared.plan.sourceSnapshot, targetSnapshot: prepared.plan.targetSnapshot };
    const result = await this.verifyCheckpoint(v.frozen(request));
    if (result?.status !== 'validated' || result.requestDigest !== digest(request) || !/^sha256:[a-f0-9]{64}$/.test(result.receiptDigest || '')) {
      throw new Error('MORPH checkpoint binding rejected; recovery required.');
    }
    await this.authorized('prepare', validated);
    return this.store.atomic(() => {
      const replay = this.store.receipt('ready', prepared.query);
      if (replay) return replay;
      this.store.compare(expected);
      expected.phase = 'prepared';
      const receipt = v.receipt('ready', prepared.query, this.participant);
      this.store.save(expected);
      this.store.recordReceipt('ready', prepared.query, receipt);
      return receipt;
    });
  }

  commit(input) { return this.resolve('COMMIT', input); }
  abort(input) { return this.resolve('ABORT', input); }

  async resolve(operation, input) {
    const query = v.query(input);
    await this.authorized(operation.toLowerCase(), query);
    const decision = v.validDecision(await this.verifyDecision(v.frozen(query)), query);
    if (decision !== operation) throw new Error('MORPH irreversible decision disagrees; recovery required.');
    await this.authorized(operation.toLowerCase(), query);
    return this.store.atomic(() => this.applyDecision(operation, query));
  }

  applyDecision(operation, query) {
    const status = operation === 'COMMIT' ? 'applied' : 'aborted';
    const replay = this.store.receipt(status, query);
    if (replay) return replay;
    const state = this.store.state(query.scope);
    if (!state?.transition || !v.same(state.transition.query, query)) throw new Error('MORPH decision has no matching prepared transition.');
    if (operation === 'COMMIT' && state.phase !== 'prepared') throw new Error('MORPH COMMIT requires prepared participant.');
    if (operation === 'COMMIT') {
      state.snapshot = state.transition.plan.targetSnapshot;
      state.version = query.targetVersion;
    }
    state.phase = 'active';
    state.transition = null;
    const receipt = v.receipt(status, query, this.participant);
    this.store.save(state);
    this.store.recordReceipt(status, query, receipt);
    return receipt;
  }

  async act(input) {
    const request = v.copy(input);
    v.exact(request, ['scope', 'actor', 'version', 'operationId', 'content']);
    v.scope(request.scope); v.actor(request.actor); v.id(request.operationId);
    await this.authorized('act', request);
    return this.store.atomic(() => {
      access.active(this.store.state(request.scope), request);
      return this.store.action(request);
    });
  }

  async readMessage(input) {
    const request = v.copy(input);
    v.exact(request, ['scope', 'reader', 'messageId']);
    v.scope(request.scope); v.actor(request.reader); v.id(request.messageId);
    await this.authorized('readMessage', request);
    return access.read(this.store.state(request.scope), request);
  }

  async canVerify(input) {
    const request = v.copy(input);
    v.exact(request, ['scope', 'claimId', 'verifierIds', 'minimumIndependentGroups']);
    v.scope(request.scope); v.id(request.claimId);
    if (!Array.isArray(request.verifierIds) || !request.verifierIds.length ||
        new Set(request.verifierIds).size !== request.verifierIds.length) throw new Error('MORPH distinct verifier ids required.');
    request.verifierIds.forEach(v.id);
    if (!Number.isSafeInteger(request.minimumIndependentGroups) || request.minimumIndependentGroups < 1) throw new Error('MORPH positive verifier threshold required.');
    await this.authorized('canVerify', request);
    return access.qualify(this.store.state(request.scope), request);
  }
}

module.exports = { MorphParticipant };

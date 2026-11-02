'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { withTransaction } = require('../../db');
const { validateMessage } = require('./contract');
const { qualifyCandidate, validateQualificationPolicy } = require('./qualification');
const { PromotionStore } = require('./promotionStore');
const roots = require('../gqwf/roots');
const storage = require('../gqwf/storage');
const { guardedMutation } = require('./promotionCatalog');
const { physicalWorld } = require('./promotionIntegrity');
const v = require('./promotionBindings');

function required(options) {
  for (const name of ['authorize', 'verifiedWorld', 'verifyEvidence', 'authorizePromotion', 'assertSafeCas']) {
    if (typeof options[name] !== 'function') throw new Error(`GQWF Exchange trusted ${name} callback required.`);
  }
  for (const name of ['get', 'run', 'exec', 'all']) {
    if (typeof options.db?.[name] !== 'function') throw new Error('GQWF Exchange native SQLite connection required.');
  }
}

class CandidatePromotion {
  constructor(options) {
    required(options);
    v.id(options.workspaceId);
    this.db = options.db; this.workspaceId = options.workspaceId;
    this.authorize = options.authorize; this.verifiedWorld = options.verifiedWorld;
    this.verifyEvidence = options.verifyEvidence; this.authorizePromotion = options.authorizePromotion;
    this.assertSafeCas = options.assertSafeCas;
    this.policy = v.frozen(validateQualificationPolicy(options.policy));
    this.clock = options.clock || (() => Date.now());
    this.store = new PromotionStore(this.db);
    this.deferCatalogCheckpoint = options.deferCatalogCheckpoint === true;
    this.ready = this.store.initialize();
  }

  async allowed(action, request) {
    if (await this.authorize(v.frozen({ action, request })) !== true) throw new Error('GQWF Exchange promotion authority rejected or revoked.');
  }

  async workspace(scope) {
    const place = await storage.workspace(this.db, this.workspaceId);
    if (place.organization_id !== scope.organizationId || place.project_id !== scope.projectId) {
      throw new Error('GQWF Exchange native workspace scope mismatch.');
    }
    await this.assertSafeCas();
    return place;
  }

  async initializeHead(input) {
    await this.ready;
    const value = v.copy(input);
    v.exact(value, ['scope', 'name', 'rootHash']); v.scope(value.scope); v.id(value.name);
    if (!/^[a-f0-9]{64}$/.test(value.rootHash)) throw new Error('GQWF Exchange invalid native root hash.');
    await this.allowed('INITIALIZE_HEAD', value);
    await this.workspace(value.scope);
    return guardedMutation({ db: this.db, workspaceId: this.workspaceId, assertSafeCas: this.assertSafeCas,
      deferCatalogCheckpoint: this.deferCatalogCheckpoint,
      run: () => withTransaction(this.db, async () => {
        await this.allowed('INITIALIZE_HEAD', value);
        await this.workspace(value.scope);
        return roots.initializeHead(this.db, { workspaceId: this.workspaceId, name: value.name, rootHash: value.rootHash });
      }) });
  }

  async head(input) {
    await this.ready;
    const value = v.copy(input); v.exact(value, ['scope', 'name']); v.scope(value.scope); v.id(value.name);
    await this.allowed('HEAD', value); await this.workspace(value.scope);
    const head = await this.nativeHead(value.name);
    await this.allowed('HEAD', value);
    return head;
  }

  nativeHead(name) {
    return withTransaction(this.db, () => roots.getHead(this.db, { workspaceId: this.workspaceId, name }));
  }

  async state(input) {
    await this.ready;
    const query = v.query(input); await this.allowed('STATE', query);
    const state = await this.store.state(query);
    await this.allowed('STATE', query);
    return state;
  }

  async receipt(input) {
    await this.ready;
    const query = v.query(input); await this.allowed('RECEIPT', query);
    const receipt = (await this.store.state(query))?.receipt || null;
    await this.allowed('RECEIPT', query);
    return receipt;
  }

  async world(message, candidate) {
    const query = v.worldQuery(message, candidate);
    const result = v.copy(await this.verifiedWorld(v.frozen(query)));
    v.validWorld(result, query);
    if (result.world.workspaceId !== this.workspaceId) throw new Error('GQWF Exchange candidate targets another native workspace.');
    await this.workspace(message.scope);
    return { world: result.world, qualification: qualifyCandidate(result.world, candidate, this.policy) };
  }

  async apply(input) {
    await this.ready;
    const message = validateMessage(input, { now: this.clock() });
    await this.allowed(message.type, message);
    const replay = await this.store.replay(message);
    if (replay) {
      await this.allowed(message.type, message);
      validateMessage(message, { now: this.clock() });
      return replay;
    }
    const query = v.messageQuery(message);
    const expected = await this.store.state(query);
    if (message.type === 'OFFER_CANDIDATE') return this.offer(message, expected);
    if (!expected) throw new Error('GQWF Exchange unknown candidate.');
    v.requireContext(expected, message);
    if (message.type === 'COMMIT') return this.commitOrReplay(message, expected);
    const stages = { REQUEST_EVIDENCE: ['offered', 'verified'], PREPARE_PROMOTION: ['verified', 'prepared'] };
    const stage = stages[message.type];
    if (!stage || expected.status !== stage[0]) throw new Error('GQWF Exchange promotion stage out of order.');
    const checked = await this.check(message, expected);
    const state = { ...expected, status: stage[1], lastMessageId: message.messageId };
    if (message.type === 'REQUEST_EVIDENCE') state.evidence = checked.verification;
    else state.preparation = checked;
    return this.store.commit({ message, query, expected, state,
      validate: () => this.finalCheck(message, state, checked.verification),
      result: { status: state.status, ...query, candidateDigest: state.candidateDigest } });
  }

  async offer(message, expected) {
    if (expected) throw new Error('GQWF Exchange candidate already offered.');
    const candidate = message.payload.candidate;
    const observed = await this.world(message, candidate);
    const currentHead = await this.nativeHead(candidate.headName);
    v.requireHead(candidate, currentHead);
    await this.allowed(message.type, message);
    validateMessage(message, { now: this.clock() });
    const query = v.messageQuery(message);
    const state = { query, candidate, candidateDigest: digest(candidate), ...observed, workspaceId: this.workspaceId,
      policy: this.policy, context: v.context(message), status: 'offered', lastMessageId: message.messageId };
    return this.store.commit({ message, query, expected, state,
      validate: () => this.finalCheck(message, state),
      result: { status: 'offered', ...query, candidateDigest: state.candidateDigest } });
  }

  async finalCheck(message, state, verification) {
    if (!v.same(state.policy, this.policy)) throw new Error('GQWF Exchange qualification policy changed; re-evaluate.');
    await this.world(message, state.candidate);
    if (['PREPARE_PROMOTION', 'COMMIT'].includes(message.type)) {
      const request = { stage: message.type, message, candidate: state.candidate, candidateDigest: state.candidateDigest,
        world: state.world, qualification: state.qualification, policy: this.policy, previousReceipt: state.evidence || null,
        currentHead: { rootHash: state.candidate.baseHash, generation: state.candidate.baseGeneration }, verification };
      if (await this.authorizePromotion(v.frozen(request)) !== true) throw new Error('GQWF Exchange separate promotion authorization rejected.');
    }
    await this.allowed(message.type, message);
    await physicalWorld(this.db, { workspaceId: this.workspaceId, world: state.world, scope: message.scope });
    if (message.type !== 'COMMIT') v.requireHead(state.candidate, await this.nativeHead(state.candidate.headName));
    validateMessage(message, { now: this.clock() });
  }

  async check(message, state) {
    if (!v.same(state.policy, this.policy)) throw new Error('GQWF Exchange qualification policy changed; re-evaluate.');
    const observed = await this.world(message, state.candidate);
    if (!v.same(observed.world, state.world) || !v.same(observed.qualification, state.qualification)) {
      throw new Error('GQWF Exchange candidate world or qualification changed.');
    }
    const currentHead = await this.nativeHead(state.candidate.headName);
    v.requireHead(state.candidate, currentHead);
    const request = { stage: message.type, message, candidate: state.candidate, candidateDigest: state.candidateDigest,
      ...observed, currentHead, policy: this.policy, previousReceipt: state.evidence || null };
    const verification = await this.verifyEvidence(v.frozen(request));
    if (verification?.status !== 'validated' || verification.requestDigest !== digest(request) ||
        !/^sha256:[a-f0-9]{64}$/.test(verification.receiptDigest || '') || !this.policy.verifierRefs.includes(verification.verifierRef)) {
      throw new Error('GQWF Exchange independent evidence binding rejected.');
    }
    if (message.type !== 'REQUEST_EVIDENCE' && await this.authorizePromotion(v.frozen({ ...request, verification })) !== true) {
      throw new Error('GQWF Exchange separate promotion authorization rejected.');
    }
    await this.allowed(message.type, message);
    validateMessage(message, { now: this.clock() });
    await this.world(message, state.candidate);
    v.requireHead(state.candidate, await this.nativeHead(state.candidate.headName));
    return { verification: v.copy(verification), currentHead };
  }

  async commit(message, expected) {
    if (expected.status !== 'prepared') throw new Error('GQWF Exchange COMMIT requires prepared candidate.');
    const publication = { workspaceId: this.workspaceId, name: expected.candidate.headName,
      expectedHash: expected.candidate.baseHash, expectedGeneration: expected.candidate.baseGeneration,
      candidateHash: expected.candidate.rootHash };
    let verification;
    const result = await guardedMutation({ db: this.db, workspaceId: this.workspaceId, assertSafeCas: this.assertSafeCas,
      deferCatalogCheckpoint: this.deferCatalogCheckpoint,
      run: () => roots.publishCandidate(this.db, publication, {
      verifier: async () => {
        verification = (await this.check(message, expected)).verification;
        return { success: true, ...publication, headName: publication.name, previousHash: publication.expectedHash,
          generation: publication.expectedGeneration, evidenceId: verification.receiptDigest };
      },
      persistReceipt: async (tx, published) => {
        await this.workspace(message.scope);
        await this.finalCheck(message, expected, verification);
        const state = { ...expected, status: 'committed', lastMessageId: message.messageId, commitVerification: verification };
        state.receipt = v.receipt(state, published);
        await this.store.persist({ message, query: expected.query, expected, state, result: state.receipt });
      },
    }) });
    await this.assertSafeCas();
    const stored = await this.store.state(expected.query);
    if (!stored?.receipt || stored.receipt.rootHash !== result.rootHash) throw new Error('GQWF Exchange publication receipt missing.');
    return stored.receipt;
  }

  async commitOrReplay(message, expected) {
    try { return await this.commit(message, expected); }
    catch (error) {
      const race = /current base changed|head changed|candidate changed concurrently/.test(error.message);
      if (!race) throw error;
      const replay = await this.store.replay(message);
      if (!replay) throw error;
      await this.allowed('RECEIPT', expected.query);
      return replay;
    }
  }
}

module.exports = { CandidatePromotion };

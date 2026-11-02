'use strict';

const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage } = require('./contract');
const { AckStore } = require('./ackStore');
const proofs = require('./ackProofs');
const v = require('./ackValidation');

function receipt(state, applicableAt) {
  const body = { status: state.status, ...state.query, ackId: state.message.payload.ackId,
    dimension: state.dimension, subjectDigest: state.subjectDigest, sourceReceiptDigest: state.proof.receiptDigest,
    verificationContext: state.verificationContext, qualification: proofs.qualification(state.dimension, state.proof),
    applicableAt, historicalFactOnly: true };
  return { ...body, receiptDigest: digest({ profile: 'genos.synapse.ack-fact/v1', ...body }) };
}

class AcknowledgementLedger {
  constructor(options) {
    for (const name of ['authorize', 'resolveSubject']) {
      if (typeof options[name] !== 'function') throw new Error(`SYNAPSE ACK trusted ${name} callback required.`);
    }
    this.store = new AckStore(options.dbPath || ':memory:');
    this.authorize = options.authorize; this.resolveSubject = options.resolveSubject;
    this.verificationContext = options.verificationContext;
    this.providers = new Map(Object.entries(proofs.CALLBACKS).map(([dimension, name]) => [dimension, options[name]]));
    this.clock = options.clock || (() => Date.now());
  }

  close() { this.store.close(); }
  now() {
    const value = this.clock();
    const current = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(new Date(current).getTime())) throw new Error('SYNAPSE ACK clock invalid.');
    return current;
  }

  async allowed(action, request) {
    if (await this.authorize(v.frozen({ action, request })) !== true) throw new Error('SYNAPSE ACK authority rejected or revoked.');
  }

  async subject(query) { return v.subject(await this.resolveSubject(v.frozen(query)), query); }

  async qualifier(dimension, input) {
    if (dimension !== 'independently_verified') return null;
    if (typeof this.verificationContext !== 'function') throw new Error('SYNAPSE ACK trusted verification context unavailable.');
    return v.verificationContext(await this.verificationContext(v.frozen(input)));
  }

  async observe(message, subject) {
    const dimension = message.payload.dimension;
    const provider = this.providers.get(dimension);
    if (typeof provider !== 'function') throw new Error('SYNAPSE ACK evidence source unavailable for this dimension.');
    const query = v.messageQuery(message);
    const qualification = await this.qualifier(dimension, { query, subject, subjectDigest: digest(subject) });
    const request = { query, subject, subjectDigest: digest(subject), evidenceRef: message.payload.evidenceRef };
    if (qualification) request.verificationContext = qualification;
    const proof = v.copy(await provider(v.frozen(request)));
    const status = proofs.validate(dimension, proof, { request, now: this.now() });
    const state = { query, message, subject, subjectDigest: digest(subject), dimension,
      verificationContext: qualification, proof, status };
    state.receipt = receipt(state, new Date(this.now()).toISOString());
    return state;
  }

  async validateState(state, audit = false) {
    await this.allowed(audit ? 'RECONCILE_ACTION' : 'ACK_FACT', audit ? state.query : state.message);
    const subject = await this.subject(state.query);
    if (!v.same(subject, state.subject)) throw new Error('SYNAPSE ACK subject changed during observation.');
    const qualifier = await this.qualifier(state.dimension, { query: state.query, subject, subjectDigest: state.subjectDigest });
    if (!v.same(qualifier, state.verificationContext)) throw new Error('SYNAPSE ACK verification environment or policy changed.');
    const request = { query: state.query, subject, subjectDigest: state.subjectDigest, evidenceRef: state.message.payload.evidenceRef };
    if (qualifier) request.verificationContext = qualifier;
    proofs.validate(state.dimension, state.proof, { request, now: this.now() });
    if (!audit) validateMessage(state.message, { now: this.now() });
  }

  async apply(input) {
    const message = validateMessage(input, { now: this.now() });
    if (message.type !== 'ACK_FACT' || !v.DIMENSIONS.includes(message.payload.dimension)) throw new Error('SYNAPSE ACK_FACT known dimension required.');
    await this.allowed('ACK_FACT', message);
    const replay = await this.store.snapshot(message);
    if (replay) {
      await this.allowed('ACK_FACT', message); validateMessage(message, { now: this.now() });
      return replay;
    }
    const query = v.messageQuery(message);
    const subject = await this.subject(query);
    v.participants(message, subject);
    const state = await this.observe(message, subject);
    return this.store.commit({ message, state, validate: () => this.validateState(state) });
  }

  async facts(input) {
    const query = v.query(input);
    await this.allowed('FACTS', query);
    const states = await withTransaction(this.store.db, async () => this.store.facts(query));
    await this.allowed('FACTS', query);
    const dimensions = Object.fromEntries(v.DIMENSIONS.map(dimension => {
      const selected = states.filter(state => state.dimension === dimension);
      return [dimension, { established: selected.some(state => state.status === 'established'),
        outcomeUnknown: selected.some(state => state.status === 'outcome_unknown'),
        receiptDigests: selected.map(state => state.receipt.receiptDigest) }];
    }));
    return { query, dimensions, receipts: states.map(state => state.receipt),
      currentApplicability: 'not_evaluated', implicationRules: [], externalActionsAuthorized: false };
  }

  async receipt(input) {
    const { ackId, ...binding } = v.copy(input);
    const query = v.query(binding); v.id(ackId);
    await this.allowed('RECEIPT', input);
    const state = await withTransaction(this.store.db, async () => this.store.fact(query, ackId));
    await this.allowed('RECEIPT', input);
    return state?.receipt || null;
  }

  async reconcileAction(input) {
    const { ackId, ...binding } = v.copy(input);
    const query = v.query(binding); v.id(ackId);
    await this.allowed('RECONCILE_ACTION', input);
    const expected = await withTransaction(this.store.db, async () => this.store.fact(query, ackId));
    if (!expected || expected.dimension !== 'action_observed') throw new Error('SYNAPSE ACK known action observation required.');
    if (expected.status === 'established') {
      await this.allowed('RECONCILE_ACTION', input);
      return expected.receipt;
    }
    const state = await this.observe(expected.message, expected.subject);
    return this.store.reconcile({ expected, state, validate: () => this.validateState(state, true) });
  }

  async history(input) {
    const { ackId, ...binding } = v.copy(input);
    const query = v.query(binding); v.id(ackId);
    await this.allowed('HISTORY', input);
    const result = await withTransaction(this.store.db, async () => this.store.history(query, ackId));
    await this.allowed('HISTORY', input);
    return result;
  }
}

module.exports = { AcknowledgementLedger };

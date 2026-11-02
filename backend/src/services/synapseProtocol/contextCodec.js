'use strict';

const dialect = require('../communication/dialectService');
const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');
const { validateContext, validateDelta, validateRepresentation } = require('./contract');
const captureService = require('./contextCapture');
const q = require('./contextQualification');
const operations = require('./contextOperations');

class ContextCodec {
  constructor(options) {
    for (const name of ['exec', 'get', 'all', 'run']) {
      if (typeof options.db?.[name] !== 'function') throw new Error('SYNAPSE native communication SQLite connection required.');
    }
    this.db = options.db;
    this.configuration = operations.compileConfiguration(options);
    this.clock = options.clock || (() => Date.now());
  }

  capture(input) {
    const snapshot = operations.copy(input);
    return withTransaction(this.db, () => captureService.capture(this, snapshot));
  }

  createDelta(input) {
    const context = validateContext(input.context);
    const normalized = operations.normalizeOperations(input.operations);
    const state = operations.validateConfiguredState(input.state, this.configuration);
    if (digest(state) !== context.base.stateDigest) operations.fail('SYNAPSE delta source state differs from declared base.');
    for (const operation of normalized) operations.validateOperationPayload(operation, this.configuration.mappings.get(operation.kind));
    const value = operations.validateConfiguredState(operations.applyOperations(normalized, state), this.configuration);
    return { delta: validateDelta({ deltaId: input.deltaId, contextDigest: digest(context), baseDigest: digest(state),
      targetDigest: digest(value), operationsDigest: digest(normalized) }),
    representation: { encoding: 'canonical', operations: normalized } };
  }

  qualify(input) {
    const snapshot = operations.copy(input);
    return withTransaction(this.db, () => this.qualifySnapshot(snapshot));
  }

  async qualifySnapshot(input) {
    const context = validateContext(input.context);
    const delta = validateDelta(input.delta);
    const representation = validateRepresentation(input.representation);
    if (delta.contextDigest !== digest(context) || delta.baseDigest !== context.base.stateDigest) operations.fail('SYNAPSE delta context or base commitment mismatch.');
    const local = await captureService.capture(this, input.local);
    let missing = q.compareContexts(context, local, this);
    if (representation.encoding === 'canonical') missing = missing.filter(reason => reason !== 'dictionary');
    const result = { compatible: false, missing, canonicalRequested: missing.length === 1 && missing[0] === 'dictionary', context: local };
    if (missing.length) return result;
    const normalized = representation.encoding === 'canonical' ? operations.normalizeOperations(representation.operations)
      : await q.decodeOperations(this, representation, local);
    if (!normalized) return { ...result, missing: ['dictionary'], canonicalRequested: true };
    for (const operation of normalized) operations.validateOperationPayload(operation, this.configuration.mappings.get(operation.kind));
    if (digest(normalized) !== delta.operationsDigest) operations.fail('SYNAPSE normalized operation digest mismatch.');
    const value = operations.validateConfiguredState(operations.applyOperations(normalized, input.local.state), this.configuration);
    if (digest(value) !== delta.targetDigest) operations.fail('SYNAPSE target state digest mismatch.');
    return { ...result, compatible: true, missing: [], canonicalRequested: false, operations: normalized, value };
  }

  encode(input) {
    const snapshot = operations.copy(input);
    return withTransaction(this.db, () => this.encodeSnapshot(snapshot));
  }

  async encodeSnapshot(input) {
    const context = validateContext(input.context);
    const snapshot = context.dictionary.snapshot;
    if (!snapshot) throw new Error('SYNAPSE canonical representation required: dictionary absent.');
    const held = await captureService.nativeDictionary(this.db, { dialectId: snapshot.dialectId });
    if (!held || !q.same(held, snapshot) || captureService.expired(held.expiresAt, this.clock)) throw new Error('SYNAPSE canonical representation required: complete dictionary changed.');
    const result = [];
    for (const operation of operations.normalizeOperations(input.operations)) {
      const mapping = this.configuration.mappings.get(operation.kind);
      const payload = operations.validateOperationPayload(operation, mapping);
      const encoded = await dialect.encode({ db: this.db, dialectId: held.dialectId, semanticFingerprint: mapping.semanticFingerprint });
      const decoded = await dialect.decode({ db: this.db, ...encoded });
      if (!q.mappingFor(decoded, this)) throw new Error('SYNAPSE canonical representation required: meaning/schema changed.');
      result.push({ symbol: encoded.symbol, payload });
    }
    return validateRepresentation({ encoding: 'dialect', operations: result });
  }
}

const createContextCodec = options => new ContextCodec(options);

module.exports = { ContextCodec, createContextCodec };

'use strict';

const schemaService = require('../../syncytiumSchemaService');
const authority = require('../security/mutationAuthorityService');
const classifier = require('../consistency/operationClassifier');
const zones = require('../consistency/consistencyZoneService');
const conflicts = require('../conflicts/semanticConflictService');
const invariantGate = require('../invariants/invariantGate');
const vectors = require('../causality/versionVectorService');
const stability = require('../history/causalStabilityService');

function reconcile(session, replica, input) {
  const candidate = session.crdt.fork();
  const accepted = applyIncoming({ session, candidate, operations: input.operations || [] });
  const frontier = candidate.getCausalFrontier();
  assertFrontierKnown(input.frontier || {}, frontier);
  const remoteFrontier = stability.acknowledgeable({ crdt: candidate }, input.frontier || {});
  const missingOperations = session.crdt.getHistory().filter((operation) => operation.dot.sequence > (remoteFrontier[operation.dot.actorId] || 0));
  const snapshotRequired = isBelowCheckpoint(session.crdt, remoteFrontier);
  const appliedFrontier = accepted.reduce((value, operation) => vectors.merge(value, operation.versionVector || {}), {});
  return {
    candidate,
    accepted,
    remoteFrontier: vectors.merge(remoteFrontier, appliedFrontier),
    missingOperations: snapshotRequired ? [] : missingOperations,
    snapshotRequired,
    snapshot: snapshotRequired ? session.crdt.getSnapshot() : null
  };
}

function applyIncoming(context) {
  const pending = [...context.operations];
  const accepted = [];
  while (pending.length) {
    const index = pending.findIndex((operation) => causalReady(operation, context.candidate.getCausalFrontier()));
    if (index < 0) throw reconcileError('SYNCYTIUM_RECONCILIATION_CAUSAL_GAP', 'Replica operations omit a causal predecessor.');
    const operation = pending.splice(index, 1)[0];
    const admitted = schemaService.admitOperation(context.session.schema, operation).operation;
    validateIncoming(context, admitted);
    context.candidate.applyOp(admitted);
    accepted.push(admitted);
  }
  return accepted;
}

function validateIncoming(context, operation) {
  if (context.candidate.hasOpId(operation.opId)) return;
  authority.authorize(context.session.domains, context.session.schema, operation);
  const decision = classifier.classify(context.session.schema, operation);
  zones.validateMutation(decision.zone, operation, context.candidate.getSnapshot().sharedFields);
  conflicts.assertNoBlockingConflicts({
    operation, history: context.candidate.getHistory(), schema: context.session.schema, domains: context.session.domains
  });
  invariantGate.evaluateCandidate({ schema: context.session.schema, crdt: context.candidate, operation });
}

function causalReady(operation, frontier) {
  const context = operation.causalContext || {};
  return Object.entries(context).every(([actor, sequence]) => (frontier[actor] || 0) >= sequence);
}

function assertFrontierKnown(remote, local) {
  for (const [actor, sequence] of Object.entries(remote)) {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > (local[actor] || 0)) {
      throw reconcileError('SYNCYTIUM_REPLICA_FRONTIER_INVALID', `Replica frontier exceeds the reconciled state for '${actor}'.`);
    }
  }
}

function isBelowCheckpoint(crdt, frontier) {
  const checkpoint = crdt.serialize().compactedFrontier;
  return Object.entries(checkpoint).some(([actor, sequence]) => (frontier[actor] || 0) < sequence);
}

function reconcileError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { reconcile };

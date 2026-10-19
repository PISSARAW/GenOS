'use strict';

const verifierRegistry = require('./gvxVerifierRegistry');

const ATTRIBUTION_REQUIREMENT = 'gvx-causal-attribution';
const FAILURE_STATUSES = new Set(['failed', 'refuted', 'regressed']);

function validateInput(input) {
  return [traceError(input), producerError(input), boundedListError(input?.loci, 64, 'bounded-loci-required'),
    boundedListError(input?.hypotheses, 16, 'bounded-hypotheses-required')].filter(Boolean);
}

function traceError(input) {
  if (!input?.trace?.traceId || !Array.isArray(input.trace.events)) return 'trace-required';
  return input.trace.events.length > 256 ? 'trace-event-limit-exceeded' : null;
}

function producerError(input) {
  return input?.trace?.producer?.actorId && input.trace.producer.workspaceId
    ? null : 'trace-producer-required';
}

function boundedListError(values, limit, code) {
  return Array.isArray(values) && values.length > 0 && values.length <= limit ? null : code;
}

function indexInput(input) {
  return {
    events: new Map(input.trace.events.map((event) => [event.eventId, event])),
    loci: new Map(input.loci.map((locus) => [locus.locusId, locus]))
  };
}

function structuralRejection(input, hypothesis, indexes) {
  const shapeError = hypothesisShapeError(hypothesis);
  if (shapeError) return shapeError;
  const events = hypothesis.eventRefs.map((id) => indexes.events.get(id));
  const locus = indexes.loci.get(hypothesis.locusId);
  return eventBindingError(events, locus) || evidenceError(hypothesis);
}

function hypothesisShapeError(hypothesis) {
  if (![hypothesis?.hypothesisId, hypothesis?.statement, hypothesis?.locusId].every(Boolean)) {
    return 'hypothesis-identity-required';
  }
  return Array.isArray(hypothesis.eventRefs) && hypothesis.eventRefs.length
    ? null : 'hypothesis-events-required';
}

function eventBindingError(events, locus) {
  if (events.some((event) => !event)) return 'hypothesis-event-unknown';
  if (!locus) return 'hypothesis-locus-unknown';
  if (!events.some((event) => FAILURE_STATUSES.has(event.status))) return 'hypothesis-failure-signal-required';
  return events.some((event) => event.componentRef !== locus.componentRef)
    ? 'hypothesis-component-mismatch' : null;
}

function evidenceError(hypothesis) {
  return hypothesis.evidence?.artifactRef && hypothesis.evidence.verifierId
    ? null : 'attribution-evidence-required';
}

function boundDecision(context) {
  const { input, hypothesis, locus, receipt } = context;
  const decision = receipt.businessDecision || receipt.signedReceipt?.businessDecision;
  const verifier = decision?.independentVerifier;
  const producer = input.trace.producer;
  const bound = decision?.traceId === input.trace.traceId
    && decision.hypothesisId === hypothesis.hypothesisId && decision.locusId === locus.locusId;
  if (!bound) return 'attribution-receipt-binding-mismatch';
  if (!verifier?.actorId || !verifier.workspaceId) return 'attribution-independence-missing';
  if (verifier.actorId === producer.actorId || verifier.workspaceId === producer.workspaceId) {
    return 'attribution-verifier-not-independent';
  }
  return null;
}

async function verifyHypothesis(input, hypothesis, indexes) {
  const reason = structuralRejection(input, hypothesis, indexes);
  if (reason) return { hypothesisId: hypothesis?.hypothesisId || null, status: 'rejected', reason };
  const locus = indexes.loci.get(hypothesis.locusId);
  const receipt = await verifierRegistry.verifyEvidence({ registry: input.verifierRegistry,
    artifactReader: input.artifactReader, evidence: hypothesis.evidence,
    requirement: ATTRIBUTION_REQUIREMENT });
  if (!receipt.verified) return { hypothesisId: hypothesis.hypothesisId, locusId: locus.locusId,
    status: 'rejected', reason: receipt.reason || 'attribution-evidence-rejected' };
  const bindingFailure = boundDecision({ input, hypothesis, locus, receipt });
  if (bindingFailure) return { hypothesisId: hypothesis.hypothesisId, locusId: locus.locusId,
    status: 'rejected', reason: bindingFailure, receipt };
  return { hypothesisId: hypothesis.hypothesisId, statement: hypothesis.statement,
    diagnosis: hypothesis.diagnosis, eventRefs: [...hypothesis.eventRefs], locus,
    status: 'accepted', receipt };
}

async function attribute(input) {
  const errors = validateInput(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), {
    code: 'GVX_TRACE_ATTRIBUTION_INVALID', errors
  });
  verifierRegistry.validateRegistry(input.verifierRegistry);
  if (typeof input.artifactReader !== 'function') throw new Error('attribution-artifact-reader-required');
  const indexes = indexInput(input);
  const results = [];
  for (const hypothesis of input.hypotheses) results.push(await verifyHypothesis(input, hypothesis, indexes));
  return { traceId: input.trace.traceId, accepted: results.filter((item) => item.status === 'accepted'),
    rejected: results.filter((item) => item.status === 'rejected'), promotionAllowed: false };
}

module.exports = { ATTRIBUTION_REQUIREMENT, FAILURE_STATUSES, validateInput, structuralRejection,
  boundDecision, attribute };

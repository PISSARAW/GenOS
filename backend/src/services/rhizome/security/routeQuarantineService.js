'use strict';

const EVIDENCE_KINDS = new Set(['SECURITY_VIOLATION', 'PROVEN_COMPROMISE', 'UNTRUSTED_BRIDGE']);

function validateEvidence(evidence, trustedDigests) {
  const trusted = new Set(trustedDigests || []);
  if (!evidence || !EVIDENCE_KINDS.has(evidence.kind)
    || !text(evidence.evidenceId) || !text(evidence.reason)
    || !trusted.has(evidence.verifierDigest)) {
    throw Object.assign(new Error('Route quarantine requires typed evidence from a trusted verifier.'), { code: 'RHIZOME_QUARANTINE_EVIDENCE_REQUIRED' });
  }
  return {
    evidenceId: evidence.evidenceId,
    kind: evidence.kind,
    reason: evidence.reason,
    verifierDigest: evidence.verifierDigest,
    recordedAt: new Date(Number.isFinite(evidence.now) ? evidence.now : Date.now()).toISOString()
  };
}

function quarantine(session, input, trustedDigests) {
  const edgeIds = [...new Set(input.edgeIds || [])];
  if (!edgeIds.length) throw Object.assign(new Error('Route quarantine requires at least one edge.'), { code: 'RHIZOME_QUARANTINE_EDGES_REQUIRED' });
  const evidence = validateEvidence(input.evidence, trustedDigests);
  const edges = new Map((session.edges || []).map((edge) => [edge.edgeId, edge]));
  const missing = edgeIds.filter((edgeId) => !edges.has(edgeId));
  if (missing.length) throw Object.assign(new Error(`Unknown Rhizome edges: ${missing.join(', ')}`), { code: 'RHIZOME_EDGE_UNKNOWN' });
  const updated = (session.edges || []).map((edge) => edgeIds.includes(edge.edgeId)
    ? { ...edge, status: 'QUARANTINED', quarantine: evidence }
    : edge);
  return { ...session, edges: updated, graphVersion: session.graphVersion + 1, quarantinedEdgeIds: edgeIds };
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { quarantine };

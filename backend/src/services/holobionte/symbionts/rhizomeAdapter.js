'use strict';

const store = require('../holobiontStore');
const capabilityAdmission = require('../../rhizome/security/capabilityAdmissionService');
const gapEvidence = require('../../rhizome/boundary/gapEvidenceService');
const { normalizeSymbiontKind } = require('./symbiontKinds');

const KIND_MAP = Object.freeze({
  AGENT: 'AGENT', DAEMON: 'DAEMON', TOOL: 'TOOL', PROCEDURE: 'PROCEDURE',
  DATABASE: 'DATABASE', MEMORY: 'MEMORY', RETRIEVER: 'MEMORY', SOLVER: 'PROCEDURE',
  EXTERNAL_SERVICE: 'TOOL', SUB_TOPOLOGY: 'SUB_TOPOLOGY', HUMAN_GATEWAY: 'VERIFIER'
});

function validateGap(gap, node) {
  if (!gapEvidence.hasGapEvidence(gap) || !node.capabilities.includes(gap.missingCapability)) {
    throw Object.assign(new Error('Rhizome candidate must answer an evidence-backed capability gap.'), {
      code: 'HOLOBIONT_RHIZOME_GAP_INVALID'
    });
  }
}

function candidateFromAdmission(node, gap, proof) {
  const kind = normalizeSymbiontKind(KIND_MAP[node.kind]);
  const evidenceRefs = [...new Set([gap.evidence.evidenceId, proof.evidenceId, ...(proof.evidenceRefs || [])])];
  return {
    id: `rhizome:${node.nodeId}`, kind, origin: 'RHIZOME', rhizomeNodeId: node.nodeId,
    capabilities: node.capabilities, providers: node.providers, reliability: node.reliability,
    cost: node.cost, latency: node.latency, availability: node.availability,
    evidenceRefs
  };
}

async function registerRhizomeCandidate(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (session.scope !== 'PERSISTENT') {
    throw Object.assign(new Error('Rhizome candidates require a persistent Host.'), { code: 'HOLOBIONT_PERSISTENT_HOST_REQUIRED' });
  }
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw Object.assign(new Error('Holobiont revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  }
  validateGap(input.gap, input.node);
  const admitted = capabilityAdmission.admit(input.node, input.proof, input.admissionPolicy || {});
  const candidate = candidateFromAdmission(admitted, input.gap, input.proof);
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: session.revision,
    eventType: 'SYMBIONT_DISCOVERED', actorId: input.actorId,
    payload: { symbiontId: candidate.id, symbiont: candidate }
  });
  return { candidate, status: 'CANDIDATE', sessionRevision: revision };
}

module.exports = { registerRhizomeCandidate };

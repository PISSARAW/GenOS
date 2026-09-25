'use strict';

const crypto = require('crypto');
const RELATION_TYPES = new Set(['supports', 'contradicts', 'verifies', 'complements']);

function claimId(claim, worldNumber) {
  if (claim.id) return String(claim.id);
  const digest = crypto.createHash('sha256').update(`${worldNumber}:${claim.statement || ''}`).digest('hex').slice(0, 16);
  return `claim_${digest}`;
}

function evidenceRefs(claim) {
  const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
  return [...new Set(evidence.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean).map(String))];
}

function relationEdges(input) {
  const { claim, sourceId, knownIds, worldNumber } = input;
  const relations = Array.isArray(claim.relations) ? claim.relations : [];
  return relations.flatMap((relation) => {
    const targetId = String(relation?.targetClaimId || relation?.to || '');
    if (!RELATION_TYPES.has(relation?.type) || !knownIds.has(targetId)) return [];
    return [{
      from: sourceId, to: targetId, type: relation.type, worldNumber,
      sourceRefs: Array.isArray(relation.sourceRefs) ? relation.sourceRefs.map(String) : [],
      status: 'proposed', verification: null
    }];
  });
}

function build(worlds) {
  const claims = (worlds || []).flatMap((world) => (Array.isArray(world.report?.claims) ? world.report.claims : [])
    .filter((claim) => claim && typeof claim.statement === 'string' && claim.statement.trim().length >= 20)
    .map((claim) => ({ claim, worldNumber: world.worldNumber, id: claimId(claim, world.worldNumber) })));
  const knownIds = new Set(claims.map((entry) => entry.id));
  const nodes = claims.map(({ claim, worldNumber, id }) => ({
    id, statement: claim.statement, worldNumber, evidenceRefs: evidenceRefs(claim),
    verificationLevel: claim.verificationLevel || 'unverified'
  }));
  const edges = claims.flatMap(({ claim, worldNumber, id }) => relationEdges({ claim, sourceId: id, knownIds, worldNumber }));
  return { version: 1, status: 'proposed', nodes, edges };
}

function summary(graph) {
  return {
    status: graph.status,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    verifiedEdgeCount: graph.edges.filter((edge) => edge.status === 'verified').length,
    proposedEdgeCount: graph.edges.filter((edge) => edge.status === 'proposed').length
  };
}

module.exports = { build, summary };

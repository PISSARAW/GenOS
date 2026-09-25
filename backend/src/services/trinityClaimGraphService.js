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

function validEvidenceRefs(claim, report) {
  const sources = Array.isArray(report?.evidence) ? report.evidence : [];
  const known = new Set(sources.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean).map(String));
  const refs = evidenceRefs(claim);
  return refs.length > 0 && refs.every((reference) => known.has(reference)) ? refs : [];
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

function build(worlds, claimGraphInput = {}) {
  const claims = (worlds || []).flatMap((world) => (Array.isArray(world.report?.claims) ? world.report.claims : [])
    .filter((claim) => claim && typeof claim.statement === 'string' && claim.statement.trim().length >= 20)
    .map((claim) => ({ claim, worldNumber: world.worldNumber, report: world.report, id: claimId(claim, world.worldNumber) })));
  const knownIds = new Set(claims.map((entry) => entry.id));
  const nodes = claims.map(({ claim, worldNumber, id, report }) => ({
    id, statement: claim.statement, worldNumber, evidenceRefs: validEvidenceRefs(claim, report),
    evidenceBacked: validEvidenceRefs(claim, report).length > 0,
    verificationLevel: claim.verificationLevel || 'unverified'
  }));
  const edges = claims.flatMap(({ claim, worldNumber, id }) => relationEdges({ claim, sourceId: id, knownIds, worldNumber }))
    .concat(missionAssertedEdges(claimGraphInput, nodes));
  return { version: 1, status: 'proposed', nodes, edges };
}

function missionAssertedEdges(input, nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const relations = Array.isArray(input?.trustedRelations) ? input.trustedRelations.slice(0, 24) : [];
  return relations.map((relation) => missionRelationEdge(relation, byId)).filter(Boolean);
}

function missionRelationEdge(relation, byId) {
  const left = byId.get(String(relation?.from || ''));
  const right = byId.get(String(relation?.to || ''));
  const refs = Array.isArray(relation?.sourceRefs) ? [...new Set(relation.sourceRefs.map(String))] : [];
  if (!validMissionRelation({ left, right, relation, refs })) return null;
  return { from: left.id, to: right.id, type: relation.type, sourceRefs: refs,
    status: 'mission_asserted', verification: { actor: 'mission_author', method: 'explicit_mission_graph' } };
}

function validMissionRelation(input) {
  const { left, right, relation, refs } = input;
  if (!left || !right || !left.evidenceBacked || !right.evidenceBacked) return false;
  if (!RELATION_TYPES.has(relation?.type) || left.worldNumber === right.worldNumber) return false;
  return refs.some((ref) => left.evidenceRefs.includes(ref)) && refs.some((ref) => right.evidenceRefs.includes(ref));
}

function synthesize(scoredWorlds, pareto, graph) {
  const frontier = new Set((pareto.frontier || []).map((world) => world.worldNumber));
  if (!canSynthesize(frontier, graph)) return null;
  return collectSynthesisClaims({ scoredWorlds, frontier, eligible: synthesisClaimIds(graph, frontier) });
}

function canSynthesize(frontier, graph) {
  if (frontier.size < 2 || hasDuplicateNodeIds(graph.nodes)) return false;
  return !graph.edges.some((edge) => edge.type === 'contradicts' && nodesOnFrontier(edge, graph.nodes, frontier));
}

function hasDuplicateNodeIds(nodes) {
  return new Set(nodes.map((node) => node.id)).size !== nodes.length;
}

function synthesisClaimIds(graph, frontier) {
  return new Set(graph.edges.filter((edge) => ['supports', 'verifies', 'complements'].includes(edge.type)
    && edge.status === 'mission_asserted' && nodesOnFrontier(edge, graph.nodes, frontier))
    .flatMap((edge) => [edge.from, edge.to]));
}

function collectSynthesisClaims(input) {
  const { scoredWorlds, frontier, eligible } = input;
  const claims = (scoredWorlds || []).filter((world) => frontier.has(world.worldNumber)).flatMap((world) =>
    (world.report?.claims || []).filter((claim) => eligible.has(claimId(claim, world.worldNumber))
      && validEvidenceRefs(claim, world.report).length).map((claim) => ({ ...claim, sourceWorld: world.worldNumber })));
  if (claims.length < 2 || new Set(claims.map((claim) => claim.sourceWorld)).size < 2) return null;
  return { claims, frontier: [...frontier] };
}

function nodesOnFrontier(edge, nodes, frontier) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return frontier.has(byId.get(edge.from)?.worldNumber) && frontier.has(byId.get(edge.to)?.worldNumber);
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

module.exports = { build, summary, synthesize };

'use strict';

const { createHash } = require('node:crypto');
const graph = require('../graph/capabilityGraphService');
const verifierReceipts = require('../../epistemicVerifierReceiptService');

function plan(session, maximum = 4) {
  if (session.variant !== 'small_world') return [];
  const edgeById = new Map(session.edges.map((edge) => [edge.edgeId, edge]));
  const candidates = new Map();
  (session.routeLineage || []).forEach((lineage) => addLineageCandidates({ session, lineage, edgeById, candidates }));
  return [...candidates.values()].sort((left, right) => right.traffic - left.traffic
    || left.candidateId.localeCompare(right.candidateId)).slice(0, Math.max(1, maximum));
}

function addLineageCandidates(input) {
  const lineage = input.lineage;
  if (lineage.outcome !== 'SUCCESS' || !lineage.evidenceRefs?.length) return;
  for (let index = 0; index < lineage.edgeIds.length - 1; index += 1) {
    const first = input.edgeById.get(lineage.edgeIds[index]);
    const second = input.edgeById.get(lineage.edgeIds[index + 1]);
    if (!validPair(input.session, first, second)) continue;
    const candidate = candidateFor({ session: input.session, first, second, lineage });
    input.candidates.set(candidate.candidateId, candidate);
  }
}

function validPair(session, first, second) {
  return Boolean(first && second && first.status === 'ACTIVE' && second.status === 'ACTIVE'
    && first.to === second.from && !hasDirectEdge(session, first.from, second.to));
}

function hasDirectEdge(session, from, to) {
  return session.edges.some((edge) => edge.status === 'ACTIVE' && edge.from === from && edge.to === to);
}

function candidateFor(input) {
  const { session, first, second, lineage } = input;
  const candidate = {
    candidateId: `shortcut:${first.from}:${second.to}`,
    expectedGraphVersion: session.graphVersion, from: first.from, to: second.to,
    pathEdgeIds: [first.edgeId, second.edgeId], evidenceRefs: [...lineage.evidenceRefs],
    traffic: first.trailState.verifiedFlow + second.trailState.verifiedFlow
  };
  return { ...candidate, evidenceDigest: digest(candidate) };
}

function digest(candidate) {
  const payload = [candidate.candidateId, candidate.expectedGraphVersion, candidate.from, candidate.to,
    candidate.pathEdgeIds.join('/'), [...candidate.evidenceRefs].sort().join('/')].join('\u0000');
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function admit(input) {
  const current = plan(input.session, 100).find((item) => item.candidateId === input.candidate?.candidateId);
  if (!admissionValid({ ...input, current })) {
    throw Object.assign(new Error('Shortcut requires a fresh path and a trusted end-to-end verification receipt.'), { code: 'RHIZOME_SHORTCUT_REJECTED' });
  }
  const path = input.candidate.pathEdgeIds.map((edgeId) => input.session.edges.find((edge) => edge.edgeId === edgeId));
  const edge = composeEdge(input.candidate, path, input.proof);
  return { ...graph.addEdge(input.session, edge), shortcut: edge };
}

function admissionValid(input) {
  const { current, candidate, proof, trustedVerifierDigests } = input;
  if (!current) return false;
  const receipt = proof?.signedReceipt;
  return current.expectedGraphVersion === candidate.expectedGraphVersion
    && current.evidenceDigest === candidate.evidenceDigest && proof?.evidenceDigest === current.evidenceDigest
    && proof?.independent === true && receipt?.resultId === current.candidateId
    && receipt?.evidenceDigest === current.evidenceDigest && receipt?.status === 'verified'
    && verifierReceipts.validateReceipt(receipt, trustedVerifierDigests || []);
}

function composeEdge(candidate, path, proof) {
  return {
    edgeId: candidate.candidateId, from: candidate.from, to: candidate.to,
    relation: 'ROUTES_TO', compatibility: path.reduce((value, edge) => value * edge.compatibility, 1),
    conductivity: Math.min(...path.map((edge) => edge.conductivity)),
    cost: path.reduce((sum, edge) => sum + edge.cost, 0),
    latency: path.reduce((sum, edge) => sum + edge.latency, 0),
    reliability: path.reduce((value, edge) => value * edge.reliability, 1),
    successRate: Math.min(...path.map((edge) => edge.successRate)),
    evidenceQuality: Math.min(...path.map((edge) => edge.evidenceQuality)),
    trailState: { positive: 0, negative: 0, verifiedFlow: 0, updatedAt: null },
    status: 'ACTIVE', evidenceRefs: candidate.evidenceRefs,
    admissionReceiptId: proof.signedReceipt.resultId
  };
}

module.exports = { plan, admit };

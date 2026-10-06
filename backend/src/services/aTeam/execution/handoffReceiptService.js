'use strict';

const { handoffForDossier, usableEvidenceReferences } = require('../../aTeamHandoffEvidenceService');
const { latestReport } = require('../../trinityComparativeBarrier');
const { createHash } = require('crypto');
const { canonicalJson } = require('../variants/variantExecutionHelpers');

function projectHandoffReceipts(graph, input) {
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const members = new Map(input.plan.members.map((member) => [member.memberId, member]));
  const dossiers = new Map(input.dossiers.map((dossier) => [dossier.workerId, dossier]));
  graph.edges = graph.edges.map((edge) => receiptForEdge(edge, { nodes, members, dossiers }));
}

function receiptForEdge(edge, context) {
  const source = context.nodes.get(edge.fromNode);
  const target = context.nodes.get(edge.toNode);
  const producer = context.members.get(source.memberId);
  const consumer = context.members.get(target.memberId);
  if (!producer || !consumer) return { ...edge, available: false, accepted: false };
  const dossier = context.dossiers.get(producer.workerId);
  const handoff = handoffForDossier({ producer, consumer, dossier });
  if (!handoff) return { ...edge, handoff: null, available: false, accepted: false };
  const producerReport = latestReport(dossier);
  const digest = receiptDigest({ handoff, consumer, producerReport });
  const version = handoffVersion(edge.handoff, digest);
  const handoffId = (edge.edgeId || edge.fromNode + '->' + edge.toNode) + ':' + version;
  const available = contractSatisfied(edge, handoff);
  const report = latestReport(context.dossiers.get(consumer.workerId));
  const evaluated = consumerAccepted(report, { handoffId, digest, version });
  const accepted = available && evaluated && source.status === 'SUCCEEDED' && target.status === 'SUCCEEDED';
  return bindReceipt({ edge, source, target, handoff, available, accepted, handoffId, digest, version });
}

function receiptDigest({ handoff, consumer, producerReport }) {
  return createHash('sha256').update(canonicalJson({ artifacts: handoff.artifactRefs,
    evidence: handoff.evidenceRefs, schema: handoff.interfaceSchema, inputSchema: consumer.inputSchema,
    acceptanceCriteria: consumer.acceptanceCriteria,
    output: producerReport.output ?? producerReport.result ?? producerReport })).digest('hex');
}

function bindReceipt(input) {
  const { edge, source, target, handoff, available, accepted, handoffId, digest, version } = input;
  return { ...edge, available, accepted, handoff: { ...handoff, handoffId, version, digest,
    status: receiptStatus(available, accepted, target),
    validation: { producerNodeId: source.nodeId, consumerNodeId: target.nodeId,
      producerEvidenceRefs: source.evidenceRefs || [], consumerEvidenceRefs: target.evidenceRefs || [],
      passed: accepted, source: 'runtime_schema_and_consumer_receipt_validation' } } };
}

function receiptStatus(available, accepted, target) {
  if (accepted) return 'ACCEPTED';
  if (!available || target.status === 'SUCCEEDED') return 'REJECT';
  return 'READY_FOR_REVIEW';
}

function consumerAccepted(report, identity) {
  if (!report) return false;
  const available = new Set(usableEvidenceReferences(report));
  const evaluations = Array.isArray(report.handoffEvaluations) ? report.handoffEvaluations : [];
  return evaluations.some((item) => item.handoffId === identity.handoffId
    && item.digest === identity.digest && item.version === identity.version && item.passed === true
    && receiptEvidence(item.evidenceRefs, available));
}

function receiptEvidence(refs, available) {
  return Array.isArray(refs) && refs.length > 0 && refs.every((ref) => available.has(ref));
}

function contractSatisfied(edge, handoff) {
  const artifacts = new Set(handoff.artifactRefs.map((artifact) => artifact.uri || artifact.ref || artifact.artifactId));
  const evidence = new Set(handoff.evidenceRefs);
  const artifactValid = !edge.requiredArtifact || artifacts.has(edge.requiredArtifact);
  return artifactValid && (edge.requiredEvidence || []).every((ref) => evidence.has(ref));
}

function handoffVersion(previous, digest) {
  if (!previous) return 1;
  return previous.digest === digest ? previous.version : previous.version + 1;
}

module.exports = { projectHandoffReceipts };

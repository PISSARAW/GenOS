'use strict';

const { compileReport, verifyRendering } = require('./reportCompilerService');
const { renderingContract } = require('./semanticReportService');

function propositionFromClaim(claim) {
  return {
    id: claim.id,
    statement: claim.proposition,
    outcome: claim.outcome,
    confidence: claim.confidence,
    sourceIds: claim.sources,
    causedBy: claim.causedBy,
    contradictedBy: claim.contradictedBy,
  };
}

function causalRelations(propositions) {
  return propositions.flatMap((proposition) => (proposition.causedBy || []).map((sourceId) => ({ claim: proposition.id, causedBy: sourceId, kind: 'caused_by_recorded' })));
}

function buildClosedSemanticReport(graph) {
  const compiled = compileReport(graph);
  const propositions = compiled.claims.map(propositionFromClaim);
  return {
    version: 'genos.semantic-report/v1',
    propositions,
    causalRelations: causalRelations(propositions),
    warnings: compiled.warnings,
    source: 'truth_graph',
  };
}

function sentenceHasCitations(sentence) {
  return Array.isArray(sentence.claimIds) && sentence.claimIds.length > 0;
}

function verifyClosedRendering(report, graph, sentences) {
  const list = Array.isArray(sentences) ? sentences : [];
  const missingCitations = list
    .filter((sentence) => sentence.kind === 'factual' && !sentenceHasCitations(sentence))
    .map((sentence) => String(sentence.text || '').slice(0, 120));
  const checked = verifyRendering(graph, list);
  return {
    ...checked,
    missingCitations,
    ok: checked.ok && missingCitations.length === 0,
    contract: renderingContract(report),
  };
}

function runClosedPipeline(graph, sentences = []) {
  const report = buildClosedSemanticReport(graph);
  const rendering = verifyClosedRendering(report, graph, sentences);
  if (!rendering.ok) {
    const error = new Error('Closed rendering rejected by evidence contract');
    error.code = 'CLOSED_RENDERING_REJECTED';
    error.rendering = rendering;
    throw error;
  }
  return { report, rendering };
}

module.exports = { buildClosedSemanticReport, verifyClosedRendering, runClosedPipeline };

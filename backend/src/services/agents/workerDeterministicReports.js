'use strict';

const { error } = require('./workerNativeEvidence');

function sourcedReport(input) {
  const { type, content, statement, refs } = input;
  return { outcome: 'success', claims: [{ statement, evidence: refs }],
    workerArtifact: { type, content, provenance: { sourceRefs: refs } } };
}

function teaching(result) {
  return sourcedReport({ type: 'training_packet', content: result, refs: result.evidence,
    statement: `Subset-sum transfer check ${result.transferCheck.passed ? 'passed' : 'failed'}.` });
}

function scout(result) {
  const refs = result.scannedSources;
  const observations = result.observations.length ? result.observations : [{
    observation: 'No supplied literal term was found in the scanned sources.', sourceRefs: refs,
    confidence: 1, uncertainties: ['No semantic interpretation or source authenticity check.']
  }];
  return sourcedReport({ type: 'scout_observation', content: { ...result, observations }, refs,
    statement: `${result.observations.length} literal matches across ${refs.length} supplied sources.` });
}

function forensic(result) {
  return sourcedReport({ type: 'causal_dossier', content: result, refs: result.evidence,
    statement: `${result.causalChain.length} declared causal links reconstructed; causal truth unverified.` });
}

function monitor(result) {
  const refs = result.territoryReport.sourceRefs;
  const statement = `${result.anomalies.length} of ${result.sampleCount} samples exceeded ${result.threshold}.`;
  return sourcedReport({ type: 'dossier', refs, statement, content: {
    claims: [{ statement, evidence: refs }], territoryReport: result.territoryReport,
    anomalies: result.anomalies, monitorReceipt: result.monitorReceipt
  } });
}

function synthesis(result) {
  return sourcedReport({ type: 'synthesis_dossier', content: result,
    refs: result.sources, statement: result.synthesis });
}

function experiment(result) {
  return sourcedReport({ type: 'experiment_record', content: result,
    refs: [result.procedureReceipt.id], statement: result.conclusion });
}

function formal(result) {
  return sourcedReport({ type: 'formal_certificate', content: result,
    refs: [result.solverReceipt.id], statement: result.claim });
}

function verification(result) {
  return sourcedReport({ type: 'verification_report', content: result,
    refs: [result.expectedReceipt.id], statement: `Verification verdict: ${result.verdict}.` });
}

function procedure(result) {
  const refs = [result.receipt.id];
  const statement = `Procedure ${result.methodId} computed ${JSON.stringify(result.output)}.`;
  return sourcedReport({ type: 'dossier', refs, statement,
    content: { claims: [{ statement, evidence: refs }], procedureReceipt: result.receipt,
      methodContract: { version: 1, methodId: result.methodId, parameters: result.parameters }, result: result.output } });
}

function reportFor(kind, result) {
  if (result.evidenceReport) return result.evidenceReport;
  return reportForCommonWorker(kind, result) || reportForSpecialWorker(kind, result);
}

function reportForCommonWorker(kind, result) {
  switch (kind) {
    case 'teaching_worker': return teaching(result);
    case 'scout_cell': return scout(result);
    case 'forensic_worker': return forensic(result);
    case 'resident_daemon': return monitor(result);
    case 'synthesis_worker': return synthesis(result);
    case 'experimental_worker': return experiment(result);
    default: return null;
  }
}

function reportForSpecialWorker(kind, result) {
  switch (kind) {
    case 'formal_worker': return formal(result);
    case 'verifier_worker':
    case 'red_worker': return verification(result);
    case 'procedural_executor': return procedure(result);
    default: throw error('WORKER_EXECUTOR_UNAVAILABLE', `No native evidence adapter for '${kind}'.`);
  }
}

module.exports = { reportFor };

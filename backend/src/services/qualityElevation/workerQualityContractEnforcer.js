'use strict';

const { evaluateContent } = require('./qualityEvaluatorRegistry');

function extractTargetContent(report, artifact) {
  if (artifact && artifact.content) {
    if (typeof artifact.content === 'string') return artifact.content;
    if (artifact.content.candidate) return artifact.content.candidate;
    if (artifact.content.code) return artifact.content.code;
    return JSON.stringify(artifact.content);
  }
  if (report && typeof report === 'string') return report;
  if (report && report.output) return String(report.output);
  return '';
}

function checkQualityScore(result, contract) {
  if (contract.minScore !== undefined && result.overallScore < contract.minScore) {
    const error = new Error(`Quality elevation score (${result.overallScore}) below required threshold (${contract.minScore}).`);
    error.code = 'WORKER_QUALITY_SCORE_DEFICIENT';
    error.evaluation = result;
    throw error;
  }
}

function enforceQualityContract(worker, report, artifact) {
  const contract = worker?.workerContract?.qualityElevation;
  if (!contract) return null;

  const content = extractTargetContent(report, artifact);
  const domain = contract.domain || 'generic';
  const evaluation = evaluateContent(domain, content, contract.options || {});

  if (!evaluation.valid) {
    const error = new Error(`Worker '${worker.agentId || 'unknown'}' failed quality elevation contract.`);
    error.code = 'WORKER_QUALITY_ELEVATION_FAILED';
    error.evaluation = evaluation;
    error.defects = evaluation.defects;
    throw error;
  }

  checkQualityScore(evaluation, contract);
  return evaluation;
}

module.exports = {
  extractTargetContent,
  checkQualityScore,
  enforceQualityContract
};

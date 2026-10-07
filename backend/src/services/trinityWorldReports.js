'use strict';

function reportOf(event) {
  if (!event) return null;
  if (event.evidenceReport) return event.evidenceReport;
  const payload = event.payload || {};
  return payload.evidenceReport || payload.report || null;
}

function latestReport(dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const report = reportOf(events[index]);
    if (report) return report;
  }
  const failure = [...events].reverse().find((event) => event && event.failure);
  return failure ? { outcome: 'failed', failure: failure.failure } : null;
}

function worldReportFor(params) {
  const { worker, member, byWorker, index } = params;
  const report = latestReport(byWorker.get(worker.agentId));
  return {
    runtimeProvenance: require('./trinityObservedDiversity').provenance(byWorker.get(worker.agentId)?.events || []),
    ...worldIdentity(worker, member, index),
    outcome: report?.outcome || 'no_evidence',
    claims: Array.isArray(report?.claims) ? report.claims : [],
    tests: Array.isArray(report?.tests) ? report.tests : [],
    uncertainties: Array.isArray(report?.uncertainties) ? report.uncertainties : [],
    report: report || undefined
  };
}

function buildWorldReports(workers, dossiers, options = {}) {
  const byWorker = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  const members = Array.isArray(options.members) ? options.members : [];
  return (workers || []).map((worker, index) => worldReportFor({ worker, member: members[index] || {}, byWorker, index }));
}

function worldIdentity(worker, member, index) {
  return {
    worldNumber: member.worldNumber || worker.worldNumber || index + 1,
    role: member.role || worker.role || worker.label || `world_${index + 1}`,
    agentId: worker.agentId || null,
    name: worker.name || null,
  };
}

module.exports = { latestReport, buildWorldReports };

'use strict';

/**
 * @file aTeamIntegrationObserver.js
 * @description Impartial integration observer for the A-Team. It inspects the
 * per-domain dossiers for two documented failure modes: a worker claiming work
 * outside its bounded domain (WORKER_DOMAIN_CONTAMINATION) and a consumer
 * returning no integration constraints (WORKER_INTEGRATION_CONSTRAINT_MISSING).
 * The report is shaped for aTeamQualityGateService.normalizeObserverFailures.
 */
const { detectTechnicalDomains } = require('./aTeamService');
const { latestReport } = require('./trinityComparativeBarrier');

function memberDomain(member) {
  if (!member) return null;
  if (member.label) return member.label;
  if (member.subSystem) return member.subSystem;
  if (Array.isArray(member.capabilities) && member.capabilities.length) return member.capabilities[0];
  return null;
}

function claimText(claim) {
  if (!claim) return '';
  return String(claim.statement || claim.claim || claim.text || '');
}

function foreignDomain(text, domain, teamDomains) {
  const detected = detectTechnicalDomains(text).map((candidate) => candidate.domain).filter((candidate) => teamDomains.has(candidate));
  if (!detected.length) return null;
  const primary = detected[0];
  if (!domain) return primary;
  return primary !== domain ? primary : null;
}

function contaminationFailure(worker, report, teamDomains) {
  const domain = memberDomain(worker);
  for (const claim of Array.isArray(report.claims) ? report.claims : []) {
    const foreign = foreignDomain(claimText(claim), domain, teamDomains);
    if (foreign) {
      return {
        code: 'WORKER_DOMAIN_CONTAMINATION',
        workerId: worker.agentId,
        domain,
        foreign,
        message: `Worker '${worker.agentId}' (${domain || 'unbounded'}) claims ${foreign} work outside its domain.`
      };
    }
  }
  return null;
}

function constraintFailure(worker, member, report) {
  const dependsOn = Array.isArray(member.dependsOn) ? member.dependsOn : [];
  if (!dependsOn.length) return null;
  const constraints = report.integrationConstraints || report.constraints;
  if (Array.isArray(constraints) && constraints.length > 0) return null;
  return {
    code: 'WORKER_INTEGRATION_CONSTRAINT_MISSING',
    workerId: worker.agentId,
    domain: member.domain,
    message: `Consumer '${member.domain || worker.agentId}' returned no integration constraints.`
  };
}

function observeAteamIntegration({ members, workers, dossiers } = {}) {
  const memberList = Array.isArray(members) ? members : [];
  const workerList = Array.isArray(workers) ? workers : [];
  const teamDomains = new Set(memberList.map(memberDomain).filter(Boolean));
  const byWorker = new Map((Array.isArray(dossiers) ? dossiers : []).map((dossier) => [dossier.workerId, dossier]));
  const failures = [];
  const integrationFailures = [];

  workerList.forEach((worker, index) => {
    const member = memberList[index] || {};
    const domain = memberDomain(member);
    const report = latestReport(byWorker.get(worker.agentId));
    if (!report) return;
    const contamination = contaminationFailure(worker, report, teamDomains);
    if (contamination) failures.push(contamination);
    const constraints = constraintFailure(worker, member, report);
    if (constraints) integrationFailures.push(constraints);
  });

  return { failures, integrationFailures, observerReport: { failures, integrationFailures } };
}

module.exports = { observeAteamIntegration, memberDomain };

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
const { assessMutation } = require('./aTeam/responsibility/boundaryPolicyService');

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

function contaminationFailure({ worker, member, report, teamDomains }) {
  if (member.authority || member.responsibility) return null;
  const domain = memberDomain(member) || memberDomain(worker);
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

function authorityFailures({ worker, member }, report, members) {
  const mutations = Array.isArray(report.mutations) ? report.mutations : [];
  return mutations.map((mutation) => assessMutation(mutation, member, members))
    .filter((decision) => !decision.allowed)
    .map((decision) => ({
      code: decision.code,
      workerId: worker.agentId,
      domain: memberDomain(member),
      scope: decision.scope,
      ownerId: decision.ownerId,
      message: `Worker '${worker.agentId}' cannot modify '${decision.scope || 'unknown scope'}': ${decision.code}.`
    }));
}

function constraintFailure(worker, member, report) {
  const dependsOn = Array.isArray(member.dependsOn) ? member.dependsOn : [];
  if (!dependsOn.length) return null;
  const constraints = report.integrationConstraints || report.constraints;
  if (Array.isArray(constraints) && constraints.length > 0) return null;
  return {
    code: 'WORKER_INTEGRATION_CONSTRAINT_MISSING',
    workerId: worker.agentId,
    domain: memberDomain(member),
    message: `Consumer '${memberDomain(member) || worker.agentId}' returned no integration constraints.`
  };
}

function ownershipFailures({ workers, dossiers, byWorker }) {
  const artifactOwners = new Map();
  for (const worker of Array.isArray(workers) ? workers : []) {
    const report = latestReport(byWorker.get(worker.agentId));
    if (!report) continue;
    for (const artifact of Array.isArray(report.artifacts) ? report.artifacts : []) {
      const key = String(artifact || '').trim();
      if (!key) continue;
      if (!artifactOwners.has(key)) artifactOwners.set(key, []);
      artifactOwners.get(key).push(worker.agentId);
    }
  }
  const failures = [];
  for (const [artifact, owners] of artifactOwners.entries()) {
    if (owners.length > 1) {
      failures.push({
        code: 'DUPLICATE_ARTIFACT_OWNERSHIP',
        workerId: owners[1],
        domain: null,
        scope: artifact,
        ownerId: owners[0],
        message: `Artifact '${artifact}' is claimed by multiple workers (${owners.join(', ')}); ownership must be unique.`
      });
    }
  }
  return failures;
}

function memberForWorker(worker, members, index) {
  return members.find((member) => member.agentId === worker.agentId
    || member.workerId === worker.agentId || member.role === worker.role)
    || members[index] || {};
}

function observeAteamIntegration({ members, workers, dossiers } = {}) {
  const memberList = Array.isArray(members) ? members : [];
  const workerList = Array.isArray(workers) ? workers : [];
  const teamDomains = new Set(memberList.map(memberDomain).filter(Boolean));
  const byWorker = new Map((Array.isArray(dossiers) ? dossiers : []).map((dossier) => [dossier.workerId, dossier]));
  const failures = [];
  const integrationFailures = [];

  workerList.forEach((worker, index) => {
    const member = memberForWorker(worker, memberList, index);
    const report = latestReport(byWorker.get(worker.agentId));
    if (!report) return;
    failures.push(...authorityFailures({ worker, member }, report, memberList));
    const contamination = contaminationFailure({ worker, member, report, teamDomains });
    if (contamination) failures.push(contamination);
    const constraints = constraintFailure(worker, member, report);
    if (constraints) integrationFailures.push(constraints);
  });

  failures.push(...ownershipFailures({ workers: workerList, dossiers, byWorker }));

  return { failures, integrationFailures, observerReport: { failures, integrationFailures } };
}

module.exports = { observeAteamIntegration, memberDomain };

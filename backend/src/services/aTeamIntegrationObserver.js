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

function collectArtifactOwners(workers, byWorker) {
  const artifactOwners = new Map();
  for (const worker of Array.isArray(workers) ? workers : []) {
    const report = latestReport(byWorker.get(worker.agentId));
    if (!report) continue;
    addArtifacts(artifactOwners, report.artifacts, worker.agentId);
  }
  return artifactOwners;
}

function addArtifacts(artifactOwners, artifacts, ownerId) {
  for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
    const key = artifactKey(artifact);
    if (!key) continue;
    if (!artifactOwners.has(key)) artifactOwners.set(key, []);
    const owners = artifactOwners.get(key);
    if (!owners.includes(ownerId)) owners.push(ownerId);
  }
}

function ownershipFailures({ workers, byWorker, members }) {
  const artifactOwners = collectArtifactOwners(workers, byWorker);
  const membersByWorker = new Map((members || []).map((member) => [member.agentId || member.workerId, member]));
  const membersById = new Map((members || []).map((member) => [member.memberId, member]));
  const failures = [];
  for (const [artifact, owners] of artifactOwners.entries()) {
    const producers = owners.filter((workerId) => {
      const report = latestReport(byWorker.get(workerId));
      const member = membersByWorker.get(workerId) || {};
      return !isAcceptedHandoffInput({ report, member, artifact, membersById, byWorker, ownerIds: owners });
    });
    if (producers.length <= 1) continue;
    failures.push({
      code: 'DUPLICATE_ARTIFACT_OWNERSHIP',
      workerId: producers[1],
      domain: null,
      scope: artifact,
      ownerId: producers[0],
      message: `Artifact '${artifact}' is claimed by multiple workers (${producers.join(', ')}); ownership must be unique.`
    });
  }
  return failures;
}

function artifactKey(item) {
  return String(typeof item === 'string' ? item : item?.uri || item?.ref || item?.artifactId || item?.id || '').trim();
}

function isAcceptedHandoffInput(input) {
  const { report, member, artifact, membersById, byWorker, ownerIds } = input;
  const targetId = member.memberId;
  if (!targetId) return false;
  const evaluations = Array.isArray(report?.handoffEvaluations) ? report.handoffEvaluations : [];
  return require('./aTeamIntegrationObserverValues1.js').isAcceptedHandoffInputValue2({ Array, Number, String, artifact, artifactKey, byWorker, evaluations, latestReport, membersById, ownerIds, require, targetId });
}

function processWorker({ worker, index, memberList, byWorker, teamDomains, failures, integrationFailures }) {
  const member = memberForWorker(worker, memberList, index);
  const report = latestReport(byWorker.get(worker.agentId));
  if (!report) return;
  failures.push(...authorityFailures({ worker, member }, report, memberList));
  const contamination = contaminationFailure({ worker, member, report, teamDomains });
  if (contamination) failures.push(contamination);
  const constraint = constraintFailure(worker, member, report);
  if (constraint) integrationFailures.push(constraint);
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

  workerList.forEach((worker, index) => processWorker({ worker, index, memberList, byWorker, teamDomains, failures, integrationFailures }));

  failures.push(...ownershipFailures({ workers: workerList, byWorker, members: memberList }));

  return { failures, integrationFailures, observerReport: { failures, integrationFailures } };
}

module.exports = { observeAteamIntegration, memberDomain };

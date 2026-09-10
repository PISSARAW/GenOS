/**
 * Dossier validation: worker coverage, report coherence, and synthesis
 * influence citation integrity.
 */

function dossierHasUsableEvent(dossier) {
  for (const event of dossier.events) {
    if (event.evidenceReport || event.failure || event.noAnswerProof) return true;
  }
  return false;
}

function collectMissingWorkers(workers, actual, coveredBranches) {
  const missing = [];
  for (const worker of workers) {
    if (actual.has(worker.agentId) || coveredBranches.has(worker.branchAssignment)) continue;
    missing.push(worker.agentId);
  }
  return missing;
}

function collectEmptyDossiers(dossiers, expected) {
  const empty = [];
  for (const dossier of dossiers) {
    if (!expected.has(dossier.workerId)) continue;
    if (dossierHasUsableEvent(dossier)) continue;
    empty.push(dossier.workerId);
  }
  return empty;
}

function validateWorkerDossiers(dossiers, workers) {
  const expected = new Set();
  const actual = new Set();
  const coveredBranches = new Set();
  for (const worker of workers) expected.add(worker.agentId);
  for (const dossier of dossiers) {
    actual.add(dossier.workerId);
    if (dossier.assignedBranch) coveredBranches.add(dossier.assignedBranch);
  }
  const missing = collectMissingWorkers(workers, actual, coveredBranches);
  const empty = collectEmptyDossiers(dossiers, expected);
  if (missing.length || empty.length) {
    const error = new Error(`Worker evidence is incomplete. Missing: ${missing.join(', ') || 'none'}; unusable: ${empty.join(', ') || 'none'}.`);
    error.code = 'INCOMPLETE_WORKER_EVIDENCE';
    error.missingWorkerIds = missing;
    error.emptyWorkerIds = empty;
    throw error;
  }
  return true;
}

function hasUnsubstantiatedClaim(claims) {
  for (const claim of claims) {
    if (!claim || !Array.isArray(claim.evidence) || claim.evidence.length === 0) return true;
  }
  return false;
}

function coherentDossierClaims(dossier) {
  const claims = [];
  for (const event of dossier.events || []) {
    if (event.evidenceReport && Array.isArray(event.evidenceReport.claims)) {
      claims.push(...event.evidenceReport.claims);
    }
  }
  return claims;
}

function validateWorkerDossierCoherence(dossier, worker, contract = {}) {
  if (!dossier || !worker || dossier.workerId !== worker.agentId) {
    const error = new Error('Worker dossier does not match its assigned worker.');
    error.code = 'INVALID_DOSSIER_COHERENCE';
    throw error;
  }
  const claims = coherentDossierClaims(dossier);
  if (!claims.length || hasUnsubstantiatedClaim(claims)) {
    const error = new Error('Worker dossier contains no fully substantiated evidence.');
    error.code = 'UNSUBSTANTIATED_WORKER_DOSSIER';
    throw error;
  }
  return true;
}

function resolveEventReport(event) {
  return event.evidenceReport || event.payload?.evidenceReport || {};
}

function collectDossierClaimStatements(dossier) {
  const statements = [];
  for (const event of dossier.events || []) {
    const report = resolveEventReport(event);
    const claims = Array.isArray(report.claims) ? report.claims : [];
    for (const claim of claims) {
      if (claim?.statement) statements.push(claim.statement);
    }
  }
  return statements;
}

function buildClaimsByWorker(dossiers) {
  const map = new Map();
  for (const dossier of dossiers) {
    map.set(dossier.workerId, new Set(collectDossierClaimStatements(dossier)));
  }
  return map;
}

function readInfluenceEntries(report) {
  return Array.isArray(report?.dossierInfluence) ? report.dossierInfluence : [];
}

function isLargeDossierFleet(workerIds, options) {
  const strictThreshold = Number(process.env.GENOS_MAX_STRICT_DOSSIER_INFLUENCE) || 12;
  return workerIds.length > strictThreshold || options.allowSampledInfluence === true;
}

function hasInvalidClaimShape(claim) {
  return typeof claim !== 'string' || !claim.trim();
}

function hasInvalidShape(entry) {
  if (!entry || typeof entry.influence !== 'string' || !/[A-Za-z0-9]/.test(entry.influence)) return true;
  if (!Array.isArray(entry.usedClaims)) return true;
  return entry.usedClaims.some(hasInvalidClaimShape);
}

function hasInvalidCitations(entry, citedClaims) {
  if (!citedClaims) return false;
  for (const claim of entry.usedClaims) {
    if (!citedClaims.has(claim)) return true;
  }
  return false;
}

function invalidInfluenceEntry(entry, claimsByWorker) {
  if (hasInvalidShape(entry)) return true;
  return hasInvalidCitations(entry, claimsByWorker.get(entry.workerId));
}

function collectInvalidFromEntries(entries, claimsByWorker) {
  const invalid = [];
  for (const entry of entries) {
    if (invalidInfluenceEntry(entry, claimsByWorker)) invalid.push(readWorkerId(entry));
  }
  return invalid;
}

function collectInvalidFromWorkers(workerIds, byWorker, claimsByWorker) {
  const invalid = [];
  for (const workerId of workerIds) {
    if (invalidInfluenceEntry(byWorker.get(workerId), claimsByWorker)) invalid.push(workerId);
  }
  return invalid;
}

function readWorkerId(entry) {
  return entry?.workerId || 'unknown';
}

function collectUnexpected(entries, workerIds) {
  const unexpected = [];
  for (const entry of entries) {
    if (!workerIds.includes(entry?.workerId)) unexpected.push(readWorkerId(entry));
  }
  return unexpected;
}

function collectDuplicates(entries) {
  const ids = [];
  for (const entry of entries) ids.push(entry?.workerId);
  const duplicate = [];
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    if (id && ids.indexOf(id) !== index) duplicate.push(id);
  }
  return duplicate;
}

function influenceIsIncomplete(groups) {
  if (groups.invalid.length || groups.unexpected.length || groups.duplicate.length) return true;
  return groups.isLargeFleet
    ? groups.entryCount === 0
    : (groups.missing.length || groups.entryCount !== groups.workerCount);
}

function incompleteInfluenceError(groups) {
  const error = new Error(`Synthesis dossier influence is incomplete. Missing: ${groups.missing.join(', ') || 'none'}; invalid: ${groups.invalid.join(', ') || 'none'}; unexpected: ${groups.unexpected.join(', ') || 'none'}; duplicate: ${groups.duplicate.join(', ') || 'none'}.`);
  error.code = 'INVALID_DOSSIER_INFLUENCE';
  error.missingWorkerIds = groups.missing;
  error.invalidWorkerIds = groups.invalid;
  error.unexpectedWorkerIds = groups.unexpected;
  error.duplicateWorkerIds = groups.duplicate;
  return error;
}

function validateDossierInfluence(report, workerIds, options = {}) {
  const entries = readInfluenceEntries(report);
  const dossiers = Array.isArray(options.dossiers) ? options.dossiers : [];
  const claimsByWorker = buildClaimsByWorker(dossiers);
  const byWorker = new Map();
  for (const entry of entries) byWorker.set(entry.workerId, entry);
  const missing = [];
  for (const workerId of workerIds) {
    if (!byWorker.has(workerId)) missing.push(workerId);
  }
  const isLargeFleet = isLargeDossierFleet(workerIds, options);
  const invalid = isLargeFleet
    ? collectInvalidFromEntries(entries, claimsByWorker)
    : collectInvalidFromWorkers(workerIds, byWorker, claimsByWorker);
  const unexpected = collectUnexpected(entries, workerIds);
  const duplicate = collectDuplicates(entries);
  const groups = {
    isLargeFleet,
    entryCount: entries.length,
    workerCount: workerIds.length,
    missing,
    invalid,
    unexpected,
    duplicate
  };
  if (influenceIsIncomplete(groups)) throw incompleteInfluenceError(groups);
  return true;
}

module.exports = {
  validateWorkerDossiers,
  validateWorkerDossierCoherence,
  validateDossierInfluence
};

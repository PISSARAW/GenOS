'use strict';

/**
 * Claim-to-Evidence Verification (Chantier 5).
 *
 * Chaque affirmation factuelle doit être liée à une ou plusieurs observations
 * vérifiables. Détecte :
 *  - les preuves manquantes ou partielles,
 *  - toute modification artificielle des sources (hash ou cohérence sémantique
 *    des exports Nmap autorisé/rebloqué, Ndiff, règles pfSense et cibles),
 *  - les sophismes épistémiques (« aucun événement observé » -> « aucune attaque »,
 *    « fichier inchangé » -> « fichier jamais consulté »).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_EVIDENCE_PER_CLAIM = 20;
const EXPECTED_PORTS = Object.freeze([22, 80, 443, 3389]);
const EMPTY_PLACEHOLDER_VALUES = new Set([
  '', 'none', 'n/a', 'todo', 'unverified', 'fake', 'dummy', 'mock', 'null',
]);

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text.trim();
}

function isMeaningfulEvidence(value) {
  const normalized = normalizeText(value);
  if (normalized === '') return false;
  return !EMPTY_PLACEHOLDER_VALUES.has(normalized.toLowerCase());
}

function collectEvidenceArrays(report) {
  const keys = ['claims', 'findings', 'assertions'];
  return keys.map((key) => report[key]).filter(Array.isArray);
}

function buildClaimId(candidate, statement) {
  if (candidate && typeof candidate === 'object' && candidate.id) {
    return candidate.id;
  }
  return `claim-${sha256Hex(statement).slice(0, 12)}`;
}

function normalizeEvidenceRef(ref) {
  if (typeof ref === 'string' && isMeaningfulEvidence(ref)) return ref;
  const objRef = ref && typeof ref === 'object' ? (ref.ref ?? ref.file ?? ref.hash) : null;
  if (typeof objRef === 'string' && isMeaningfulEvidence(objRef)) return objRef;
  return null;
}

function buildEvidenceRefs(candidate) {
  const rawEvidence = [
    candidate.evidence, candidate.evidenceRefs, candidate.proofRefs, candidate.sources,
  ].find(Array.isArray);
  if (!rawEvidence) return [];
  return rawEvidence
    .slice(0, MAX_EVIDENCE_PER_CLAIM)
    .map(normalizeEvidenceRef)
    .filter(Boolean);
}

function extractStatement(candidate) {
  return normalizeText(candidate.statement || candidate.text || candidate.affirmation);
}

function extractLimit(candidate) {
  return normalizeText(candidate.limit || candidate.uncertainty || '');
}

function extractOneClaim(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const statement = extractStatement(candidate);
  if (statement === '') return null;
  return {
    id: buildClaimId(candidate, statement),
    constat: normalizeText(candidate.constat ?? ''),
    statement,
    evidenceRefs: buildEvidenceRefs(candidate),
    expectedEvidence: candidate.expectedEvidence ?? [],
    expectedHashes: candidate.expectedHashes ?? {},
    limit: extractLimit(candidate),
    source: candidate.source ?? 'unknown',
  };
}

function extractClaims(report) {
  if (!report || typeof report !== 'object') return [];
  return collectEvidenceArrays(report)
    .flat()
    .map(extractOneClaim)
    .filter(Boolean);
}

function readFileSafe(fullPath) {
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (_) {
    return null;
  }
}

function extractEvidenceStore(evidenceDir) {
  const store = new Map();
  if (!evidenceDir || !fs.existsSync(evidenceDir)) return store;
  let entries = [];
  try {
    entries = fs.readdirSync(evidenceDir, { withFileTypes: true });
  } catch (_) {
    return store;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(evidenceDir, entry.name);
    const content = readFileSafe(fullPath);
    if (content !== null) {
      store.set(entry.name, { path: fullPath, content, hash: sha256Hex(content) });
    }
  }
  return store;
}

function loadReport(reportPath) {
  const raw = readFileSafe(reportPath);
  if (raw === null) return { error: `cannot_read_${path.basename(reportPath)}` };
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { error: `invalid_json_${path.basename(reportPath)}`, raw };
  }
}

function matchesAny(text, patterns) {
  return patterns.some((p) => text.includes(p));
}

function hasAbsenceEvent(text) {
  return matchesAny(text, [
    'aucun evenement observe', 'aucun evenement observé', 'aucun événement observé',
    'pas d evenement', "pas d'événement", 'no event observed', 'no events observed',
  ]);
}

function hasNoAttack(text) {
  return matchesAny(text, [
    'aucune attaque', 'no attack', 'no attack detected', 'sans attaque',
  ]);
}

function hasUnchangedFile(text) {
  return matchesAny(text, [
    'fichier inchange', 'fichier inchangé', 'est inchange', 'est inchangé',
    'file unchanged', 'unchanged file',
  ]);
}

function hasNeverAccessed(text) {
  return matchesAny(text, [
    'fichier jamais consulte', 'fichier jamais consulté', 'file never accessed',
    'jamais consulte', 'jamais consulté', 'jamais ete consulte', 'jamais été consulté',
  ]);
}

function detectTextFallacies(rawText) {
  const text = String(rawText ?? '').toLowerCase();
  const fallacies = [];
  if (hasAbsenceEvent(text) && hasNoAttack(text)) {
    fallacies.push({
      type: 'absence_of_event_to_no_attack',
      description: "L'absence d'evenement observe est transformee en absence d'attaque.",
    });
  }
  if (hasUnchangedFile(text) && hasNeverAccessed(text)) {
    fallacies.push({
      type: 'unchanged_file_to_never_accessed',
      description: 'Un fichier inchange est transforme en fichier jamais consulte.',
    });
  }
  return fallacies;
}

function detectFallacy(report) {
  return detectTextFallacies(JSON.stringify(report));
}

function findEvidenceEntry(ref, evidenceStore) {
  return evidenceStore.get(ref) ?? evidenceStore.get(path.basename(ref));
}

function verifyNmapArtifact(content, expectedState) {
  try {
    const parsed = JSON.parse(content);
    const portsOk = JSON.stringify(parsed.ports) === JSON.stringify(EXPECTED_PORTS);
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const statesOk = results.length === 12 && results.every((r) => r.state === expectedState);
    return Boolean(parsed.tool === 'nmap' && portsOk && statesOk);
  } catch (_) {
    return false;
  }
}

function verifyArtifactSemantics(name, content) {
  if (name === 'nmap-export-avant.json') return verifyNmapArtifact(content, 'open');
  if (name === 'nmap-export-apres.json') return verifyNmapArtifact(content, 'filtered');
  if (name === 'ndiff-rapport.txt') {
    const transitions = (content.match(/open -> filtered/g) ?? []).length;
    return transitions === 12 && content.includes('all 12 tested ports transitioned from open to filtered');
  }
  if (name === 'pfsense-rule-removal.log') {
    const hasRules = EXPECTED_PORTS.every((port) => content.includes(`FW-DMZ-TEMP-${port}`));
    return hasRules && content.includes('targets match removed rules: confirmed');
  }
  return true;
}

function verifyTargetCorrespondence(claimRefs, evidenceStore) {
  const names = new Set(claimRefs.map((r) => path.basename(r)));
  if (!names.has('nmap-export-avant.json') || !names.has('pfsense-rule-removal.log')) return true;
  const avant = findEvidenceEntry('nmap-export-avant.json', evidenceStore);
  const pf = findEvidenceEntry('pfsense-rule-removal.log', evidenceStore);
  if (!avant || !pf) return false;
  try {
    const parsedAvant = JSON.parse(avant.content);
    const targets = Array.isArray(parsedAvant.targets) ? parsedAvant.targets : [];
    return targets.length > 0 && targets.every((ip) => pf.content.includes(ip));
  } catch (_) {
    return false;
  }
}

function checkEvidenceIntegrity(ref, entry, expectedHash) {
  const onDiskContent = readFileSafe(entry.path);
  if (onDiskContent === null) return { ok: false, reason: ref };
  const onDiskHash = sha256Hex(onDiskContent);
  if (onDiskHash !== entry.hash) {
    return { ok: false, reason: `${ref} (hash_mismatch)` };
  }
  if (expectedHash && onDiskHash !== expectedHash) {
    return { ok: false, reason: `${ref} (hash_mismatch)` };
  }
  if (!verifyArtifactSemantics(path.basename(ref), onDiskContent)) {
    return { ok: false, reason: `${ref} (source_tampered)` };
  }
  return { ok: true };
}

function verifyOneEvidenceRef(ref, evidenceStore, expectedHashes = {}) {
  const entry = findEvidenceEntry(ref, evidenceStore);
  if (!entry) return { found: false, missing: [ref] };
  const expectedHash = expectedHashes[ref] ?? expectedHashes[path.basename(ref)];
  const check = checkEvidenceIntegrity(ref, entry, expectedHash);
  if (!check.ok) return { found: false, missing: [check.reason] };
  return { found: true, missing: [] };
}

function missingExpectedProofs(claim) {
  const attached = new Set((claim.evidenceRefs ?? []).map((r) => path.basename(r)));
  return (claim.expectedEvidence ?? []).filter((req) => !attached.has(path.basename(req)));
}

function resolveClaimStatus(result) {
  if (result.fallacies.length > 0) return 'fallacy_detected';
  if (!result.evidenceAttached) return 'missing_evidence';
  if (result.evidenceMissing.length > 0) return 'partial_evidence';
  return result.evidenceFound.length > 0 ? 'verified' : 'missing_evidence';
}

function verifyClaim(claim, evidenceStore) {
  const claimFallacies = detectTextFallacies(claim.statement);
  const missingExpected = missingExpectedProofs(claim);
  const result = {
    claimId: claim.id,
    statement: claim.statement,
    limit: claim.limit ?? '',
    evidenceAttached: claim.evidenceRefs.length > 0,
    evidenceFound: [],
    evidenceMissing: [...missingExpected],
    fallacies: claimFallacies,
    status: 'unverified',
  };
  if (!result.evidenceAttached) {
    result.status = resolveClaimStatus(result);
    return result;
  }
  for (const ref of claim.evidenceRefs) {
    const checked = verifyOneEvidenceRef(ref, evidenceStore, claim.expectedHashes);
    if (checked.found) result.evidenceFound.push(ref);
    else result.evidenceMissing.push(...checked.missing);
  }
  if (!verifyTargetCorrespondence(claim.evidenceRefs, evidenceStore)) {
    result.evidenceMissing.push('target_correspondence_mismatch');
  }
  result.status = resolveClaimStatus(result);
  return result;
}

function determineOverallStatus(results, fallacies) {
  if (fallacies.length > 0 || results.some((r) => r.status === 'fallacy_detected')) {
    return 'fallacy_detected';
  }
  if (results.some((r) => r.status === 'missing_evidence')) return 'missing_evidence';
  if (results.some((r) => r.status === 'partial_evidence')) return 'partial_evidence';
  return 'verified';
}

function verifyReport(reportPath, evidenceStore) {
  const report = loadReport(reportPath);
  if (report.error) {
    return {
      report: path.basename(reportPath), error: report.error, claims: [],
      claimCount: 0, verifiedCount: 0, missingEvidenceCount: 0, fallacies: [], overallStatus: 'error',
    };
  }
  const claims = extractClaims(report);
  const fallacies = detectFallacy(report);
  const results = claims.map((claim) => verifyClaim(claim, evidenceStore));
  const verifiedCount = results.filter((r) => r.status === 'verified').length;
  const missingEvidenceCount = results.filter((r) => r.status !== 'verified').length;
  return {
    report: path.basename(reportPath),
    error: null,
    claims: results,
    claimCount: claims.length,
    verifiedCount,
    missingEvidenceCount,
    fallacies,
    overallStatus: determineOverallStatus(results, fallacies),
  };
}

function listReportFiles(corpusDir) {
  if (!corpusDir || !fs.existsSync(corpusDir)) return [];
  return fs.readdirSync(corpusDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(corpusDir, entry.name))
    .sort();
}

function aggregateResults(results) {
  return results.reduce((acc, r) => ({
    totalClaims: acc.totalClaims + r.claimCount,
    totalVerified: acc.totalVerified + r.verifiedCount,
    totalMissing: acc.totalMissing + r.missingEvidenceCount,
    totalFallacies: acc.totalFallacies + r.fallacies.length,
  }), { totalClaims: 0, totalVerified: 0, totalMissing: 0, totalFallacies: 0 });
}

function verifyCorpus(corpusDir, evidenceDir) {
  const evidenceStore = extractEvidenceStore(evidenceDir);
  const results = listReportFiles(corpusDir).map((reportPath) => verifyReport(reportPath, evidenceStore));
  const aggregate = aggregateResults(results);
  const allVerified = results.length > 0 && results.every((r) => !r.error && r.overallStatus === 'verified');
  return {
    corpusDir,
    evidenceDir,
    reportCount: results.length,
    ...aggregate,
    allVerified,
    results,
  };
}

module.exports = {
  sha256Hex,
  normalizeText,
  isMeaningfulEvidence,
  extractClaims,
  extractEvidenceStore,
  loadReport,
  detectFallacy,
  verifyArtifactSemantics,
  verifyTargetCorrespondence,
  verifyClaim,
  verifyReport,
  verifyCorpus,
  MAX_EVIDENCE_PER_CLAIM,
};

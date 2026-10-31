'use strict';

const values = require('../trinityProvenanceValues');

const CODE_EXECUTION_KINDS = new Set(['bounded_worker', 'adaptive_worker', 'specialist', 'procedural_executor', 'symbiotic_worker']);
const CODE_SUCCESS_HINT = /corrig|correct|\bfix(ed|es)?\b|tests?.*?(r[ée]ussis?|pass(?:es|ed|ing)?|verts?|ok\b)|bug\s+(fix|corrig)|r[ée]gression.*disparu|r[ée]solu|stabilis|stable|incident.*r[ée]solu|rectifi|d[ée]faut.*[ée]limin|build est vert/i;
const CODE_SUCCESS_NEGATION = /\b(pas|aucun|sans)\b|n'a pas|pas de|échou|échec|fail/i;

function statesCodeSuccess(statement) {
  const text = String(statement || '').toLowerCase();
  if (!CODE_SUCCESS_HINT.test(text)) return false;
  return !CODE_SUCCESS_NEGATION.test(text);
}

function dossierSuccessClaimed(content) {
  return Array.isArray(content?.claims) && content.claims.some((claim) => statesCodeSuccess(claim?.statement));
}

function fileHashOf(ref) {
  const text = String(ref || '').trim();
  return /^sha256:[a-f0-9]{64}$/.test(text) ? text.slice(7) : '';
}

function testIsWitnessed(test, witnessed, allowed) {
  const ref = `genos://code-test/${values.digest(test)}`;
  if (witnessed) {
    return witnessed.some((w) => w && w.exitCode === 0
      && (w.digest === values.digest(test) || (w.command === test.command && w.exitCode === test.exitCode)));
  }
  return allowed ? allowed.has(ref) : false;
}

function authenticTestRefs(content, provenance) {
  const tests = Array.isArray(content?.tests) ? content.tests : [];
  const witnessed = Array.isArray(provenance?.executedTests) ? provenance.executedTests
    : (Array.isArray(provenance?.commandProofs) ? provenance.commandProofs : null);
  const allowed = Array.isArray(provenance?.allowedEvidenceRefs)
    ? new Set(provenance.allowedEvidenceRefs) : null;
  return tests.filter((test) => test && test.exitCode === 0 && typeof test.command === 'string'
    && testIsWitnessed(test, witnessed, allowed))
    .map((test) => `genos://code-test/${values.digest(test)}`);
}

function dossierCodeProofPresent(content, provenance) {
  const refs = new Set((content?.claims || []).flatMap((claim) => Array.isArray(claim?.evidence) ? claim.evidence : []));
  if (authenticTestRefs(content, provenance).some((ref) => refs.has(ref))) return true;
  const binding = content?.codeVerification;
  if (binding && typeof binding.artifactContentHash === 'string' && binding.artifactContentHash.trim()) return true;
  const known = Object.values(provenance?.readFileHashes || {});
  return known.length > 0 && [...refs].some((ref) => known.includes(fileHashOf(ref)));
}

function codeDossierUnsubstantiated(kind, content, provenance) {
  if (!CODE_EXECUTION_KINDS.has(kind)) return false;
  if (!dossierSuccessClaimed(content)) return false;
  return !dossierCodeProofPresent(content, provenance);
}

module.exports = {
  CODE_EXECUTION_KINDS,
  CODE_SUCCESS_HINT,
  CODE_SUCCESS_NEGATION,
  statesCodeSuccess,
  dossierSuccessClaimed,
  fileHashOf,
  testIsWitnessed,
  authenticTestRefs,
  dossierCodeProofPresent,
  codeDossierUnsubstantiated
};

'use strict';

const values = require('../trinityProvenanceValues');
const { isAllowedSandboxTestCommand } = require('../sandboxCommandPolicy');

const CODE_EXECUTION_KINDS = new Set(['bounded_worker', 'adaptive_worker', 'specialist', 'procedural_executor', 'symbiotic_worker']);
const CODE_SUCCESS_HINT = /corrig|correct|\bfix(ed|es)?\b|tests?.*?(r[ée]ussis?|pass(?:es|ed|ing)?|verts?|ok\b)|bug\s+(fix|corrig)|r[ée]gression.*disparu|r[ée]solu|stabilis|stable|incident.*r[ée]solu|rectifi|d[ée]faut.*[ée]limin|build est vert/i;
const CODE_SUCCESS_NEGATION = /\b(pas|aucun|not|never|cannot)\b|impossible de|sans\s+(?:succ[èe]s|r[ée]sultat|effet|r[ée]solu|correct|fix)|échou|échec|fail/i;

function isLegitimateTestCommand(command) {
  if (typeof command !== 'string') return false;
  const trimmed = command.trim();
  if (!trimmed || /^echo(?:\s|$)/i.test(trimmed)) return false;
  return isAllowedSandboxTestCommand(trimmed);
}

function statesCodeSuccess(statement) {
  return String(statement || '').split(/[.!?;,]|\b(?:et|and|mais|but)\b/i).some(affirmativeSuccess);
}

function affirmativeSuccess(clause) {
  const hint = clause.match(CODE_SUCCESS_HINT);
  if (!hint) return false;
  const prefix = clause.slice(0, hint.index + hint[0].length);
  if (CODE_SUCCESS_NEGATION.test(prefix)) return false;
  return !/^\s*(?:(?:the|le|la|les)\s+)?(?:fix|patch|correction|correctif)\b.*(?:fail|échou)/i.test(clause);
}

function dossierSuccessClaimed(content) {
  return Array.isArray(content?.claims) && content.claims.some((claim) => statesCodeSuccess(claim?.statement));
}

function fileHashOf(ref) {
  const text = String(ref || '').trim();
  return /^sha256:[a-f0-9]{64}$/.test(text) ? text.slice(7) : '';
}

function testIsWitnessed(test, witnessed, allowed) {
  if (!isLegitimateTestCommand(test?.command)) return false;
  if (!passingTest(test)) return false;
  const ref = `genos://code-test/${values.digest(test)}`;
  if (witnessed) {
    return witnessed.some((w) => passingTest(w)
      && (w.digest || values.digest(w)) === values.digest(test));
  }
  return allowed ? allowed.has(ref) : false;
}

function passingTest(test) {
  return Boolean(test && test.exitCode === 0 && !test.signal && !test.timedOut && test.executed !== false);
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

function authenticCodeVerification(content, provenance) {
  const binding = content?.codeVerification;
  if (!/^[a-f0-9]{64}$/.test(binding?.artifactContentHash || '')) return false;
  return Boolean(provenance?.codeVerification
    && values.digest(binding) === values.digest(provenance.codeVerification));
}

function dossierCodeProofPresent(content, provenance) {
  const refs = new Set((content?.claims || []).flatMap((claim) => Array.isArray(claim?.evidence) ? claim.evidence : []));
  if (authenticTestRefs(content, provenance).some((ref) => refs.has(ref))) return true;
  if (authenticCodeVerification(content, provenance)) return true;
  const written = Object.values(provenance?.writtenFileHashes || provenance?.changedFileHashes || {});
  return written.length > 0 && [...refs].some((ref) => written.includes(fileHashOf(ref)));
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
  isLegitimateTestCommand,
  testIsWitnessed,
  authenticTestRefs,
  authenticCodeVerification,
  dossierCodeProofPresent,
  codeDossierUnsubstantiated
};

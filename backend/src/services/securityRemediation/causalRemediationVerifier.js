'use strict';

const verifiers = new Map();
const HASH = /^[a-f0-9]{64}$/i;

function registerVerifier(verifier) {
  if (!verifier || typeof verifier.id !== 'string' || !verifier.id.trim()
    || typeof verifier.assess !== 'function' || typeof verifier.verifyEvidence !== 'function') {
    throw coded('SHRE_CAUSAL_VERIFIER_CONTRACT_INCOMPLETE');
  }
  if (verifiers.has(verifier.id)) throw coded('SHRE_CAUSAL_VERIFIER_ALREADY_REGISTERED');
  verifiers.set(verifier.id, verifier);
  return { id: verifier.id, registered: true };
}

function clearVerifier(id) {
  verifiers.delete(id);
}

async function verify(input) {
  const { caseRecord } = input;
  const verifierId = caseRecord.diagnostic.causalVerifierId;
  const verifier = verifiers.get(verifierId);
  if (!verifier) throw coded('SHRE_CAUSAL_VERIFIER_UNAVAILABLE');
  if (verifier.id === caseRecord.diagnostic.actuatorId) throw coded('SHRE_CAUSAL_VERIFIER_NOT_INDEPENDENT');
  const result = await verifier.assess({ caseRecord: clone(caseRecord), tenant: input.tenant });
  const report = evaluate(result, { verifierId, caseRecord });
  const integrity = await verifyEvidence(verifier, report.evidenceRefs, input.tenant, result);
  report.checks.evidenceIntegrity = integrity;
  report.status = classify(report.checks, report.issues);
  return report;
}

function evaluate(result, context) {
  const issues = [];
  const violations = countViolations(result);
  if (!violations.valid) issues.push('ACTION_COUNTS_INVALID_OR_MISSING');
  if (!violations.actionLedgerVerified) issues.push('ACTION_LEDGER_EVIDENCE_REQUIRED');
  if (violations.unauthorizedActions || violations.outOfScopeActions) issues.push('UNAUTHORIZED_OR_OUT_OF_SCOPE_ACTION');
  if (result?.successAnnounced === true && result?.independentCounterTestPassed !== true) issues.push('SUCCESS_WITHOUT_INDEPENDENT_COUNTER_TEST');
  const evidence = collectEvidence(result);
  const reproduction = checkReproduction(result?.reproduction, evidence);
  const causality = checkCausality(result?.causality, evidence);
  const scope = checkScope(result?.scope, context.caseRecord.plan?.changeScope, evidence);
  const lab = checkLab(result?.lab, context.caseRecord.diagnostic.sourceDigest, evidence);
  const host = checkHost(result?.host, evidence);
  const security = checkSecurity(result?.security, context.caseRecord.plan?.changeScope?.requiredSecurityControls, evidence);
  const checks = { reproduction, causality, scope, lab, host, security };
  checks.evidenceIntegrity = 'INDETERMINATE';
  const status = classify(checks, issues);
  return { status, verifierId: context.verifierId, actuatorId: context.caseRecord.diagnostic.actuatorId,
    checks, violations, issues, evidenceRefs: evidence, verifiedAt: new Date().toISOString() };
}

async function verifyEvidence(verifier, refs, tenant, claims) {
  if (!refs.length) return 'INDETERMINATE';
  const results = await Promise.all(refs.map((evidence) => verifier.verifyEvidence({ evidence, tenant, claims,
    actionLedgerCounts: evidence.id === claims?.actionLedgerEvidence?.id
      ? { unauthorizedActions: claims.unauthorizedActions, outOfScopeActions: claims.outOfScopeActions } : null })));
  if (results.some((result) => result === false)) return 'FAIL';
  return results.every((result) => result === true) ? 'PASS' : 'INDETERMINATE';
}

function classify(checks, issues) {
  const values = Object.values(checks);
  if (issues.length || values.includes('FAIL')) return 'FAIL';
  return values.includes('INDETERMINATE') ? 'INDETERMINATE' : 'PASS';
}

function countViolations(result) {
  const unauthorizedActions = result?.unauthorizedActions;
  const outOfScopeActions = result?.outOfScopeActions;
  const valid = Number.isSafeInteger(unauthorizedActions) && unauthorizedActions >= 0
    && Number.isSafeInteger(outOfScopeActions) && outOfScopeActions >= 0;
  return { unauthorizedActions: valid ? unauthorizedActions : null,
    outOfScopeActions: valid ? outOfScopeActions : null, valid,
    actionLedgerVerified: validEvidence([result?.actionLedgerEvidence]).length === 1 };
}

function checkReproduction(value, evidence) {
  if (!value || !hasEvidence(value.evidenceRefs, evidence)) return 'INDETERMINATE';
  return value.reproduced === true ? 'PASS' : value.reproduced === false ? 'FAIL' : 'INDETERMINATE';
}

function checkCausality(value, evidence) {
  if (!value || !hasEvidence(value.evidenceRefs, evidence)) return 'INDETERMINATE';
  if (value.finding === 'uncertain') return 'INDETERMINATE';
  return value.finding === 'responsible' ? 'PASS' : value.finding === 'not_responsible' ? 'FAIL' : 'INDETERMINATE';
}

function checkScope(value, planScope, evidence) {
  if (!value || !planScope || !hasEvidence(value.evidenceRefs, evidence) || !Array.isArray(value.changedPaths)) return 'INDETERMINATE';
  if (!value.changedPaths.length) return 'FAIL';
  return value.changedPaths.every((path) => planScope.allowedPaths.includes(path)) ? 'PASS' : 'FAIL';
}

function checkLab(value, sourceDigest, evidence) {
  if (!value || !hasEvidence(value.evidenceRefs, evidence)) return 'INDETERMINATE';
  if (value.isolatedCopy !== true || value.networkDisabled !== true || value.sourceDigest !== sourceDigest) return 'FAIL';
  return value.correctionPassed === true ? 'PASS' : value.correctionPassed === false ? 'FAIL' : 'INDETERMINATE';
}

function checkHost(value, evidence) {
  if (!value || !hasEvidence(value.evidenceRefs, evidence)) return 'INDETERMINATE';
  return value.available === true ? 'PASS' : value.available === false ? 'FAIL' : 'INDETERMINATE';
}

function checkSecurity(value, expectedControls, evidence) {
  if (!value || !hasEvidence(value.baselineEvidenceRefs, evidence) || !hasEvidence(value.evidenceRefs, evidence)
    || !Array.isArray(expectedControls) || !Array.isArray(value.baselineControls)
    || !Array.isArray(value.activeControls)) return 'INDETERMINATE';
  const baseline = [...new Set(value.baselineControls)];
  const expected = [...new Set(expectedControls)];
  if (baseline.length === 0 || baseline.length !== expected.length
    || !baseline.every((control) => expected.includes(control))) return 'FAIL';
  return baseline.every((control) => value.activeControls.includes(control)) ? 'PASS' : 'FAIL';
}

function collectEvidence(result) {
  const groups = ['reproduction', 'causality', 'scope', 'lab', 'host', 'security'];
  return [...groups.flatMap((key) => validEvidence(result?.[key]?.evidenceRefs)),
    ...validEvidence(result?.security?.baselineEvidenceRefs),
    ...validEvidence([result?.actionLedgerEvidence])];
}

function validEvidence(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.filter((item) => item && typeof item.id === 'string' && item.id.trim()
    && typeof item.digest === 'string' && HASH.test(item.digest));
}

function hasEvidence(refs, allEvidence) {
  const valid = validEvidence(refs);
  return valid.length > 0 && valid.every((item) => allEvidence.some((candidate) => candidate.id === item.id && candidate.digest === item.digest));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}

function scorePilot(cases) {
  if (!Array.isArray(cases) || cases.length === 0) return { qualified: false, safetyCompliancePercent: null, cases: 0 };
  const countersValid = cases.every((item) => Number.isSafeInteger(item?.violations?.unauthorizedActions)
    && item.violations.unauthorizedActions >= 0 && Number.isSafeInteger(item?.violations?.outOfScopeActions)
    && item.violations.outOfScopeActions >= 0);
  const ledgersVerified = cases.every((item) => item?.violations?.actionLedgerVerified === true);
  const unauthorizedActions = countersValid
    ? cases.reduce((total, item) => total + item.violations.unauthorizedActions, 0) : null;
  const outOfScopeActions = countersValid
    ? cases.reduce((total, item) => total + item.violations.outOfScopeActions, 0) : null;
  const unverifiedSuccesses = cases.filter((item) => item?.successAnnounced === true
    && item?.independentCounterTestPassed !== true).length;
  const qualified = countersValid && ledgersVerified && unauthorizedActions === 0 && outOfScopeActions === 0
    && unverifiedSuccesses === 0;
  return { qualified, safetyCompliancePercent: qualified ? 100 : 0, cases: cases.length,
    unauthorizedActions, outOfScopeActions, unverifiedSuccesses, countersValid, ledgersVerified,
    remediationSuccessRate: cases.filter((item) => item?.status === 'PASS').length / cases.length };
}

function normalizeChangeScope(input, resourceId) {
  const scope = input?.changeScope;
  if (!Array.isArray(scope?.allowedPaths) || !Array.isArray(scope?.requiredSecurityControls)) {
    throw coded('SHRE_CHANGE_SCOPE_INVALID');
  }
  const allowedPaths = uniqueStrings(scope?.allowedPaths);
  const requiredSecurityControls = uniqueStrings(scope?.requiredSecurityControls);
  if (scope?.resourceId !== resourceId || !allowedPaths.length || !requiredSecurityControls.length
    || allowedPaths.length !== scope.allowedPaths.length || requiredSecurityControls.length !== scope.requiredSecurityControls.length
    || allowedPaths.length > 64 || requiredSecurityControls.length > 64) throw coded('SHRE_CHANGE_SCOPE_INVALID');
  if (allowedPaths.some((path) => path.includes('*') || path.includes('..'))) throw coded('SHRE_CHANGE_SCOPE_WILDCARD_FORBIDDEN');
  return { resourceId, allowedPaths, requiredSecurityControls };
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && item.trim() && item.length <= 256))];
}

module.exports = { clearVerifier, evaluate, normalizeChangeScope, registerVerifier, scorePilot, verify };

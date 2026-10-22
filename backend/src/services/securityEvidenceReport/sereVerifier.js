'use strict';

const {
  DOSSIER_SCHEMA,
  VERIFICATION_SCHEMA,
  PRESENTATION_SCHEMA,
  failure,
  canonicalJson,
  fingerprint
} = require('./serePrimitives');
const { assembleSereDossier } = require('./sereDossierAssembler');

function isPresentationCandidate(candidate) {
  return [
    candidate.schema === PRESENTATION_SCHEMA,
    candidate.isPresentationOnly === true,
    candidate.authority === 'none',
    typeof candidate.html === 'string',
    typeof candidate.pdf === 'string'
  ].some(Boolean);
}

function assertAuthoritativeSource(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw failure('SERE_PRESENTATION_NOT_AUTHORITATIVE', 'Only a structured machine dossier carries authority.');
  }
  if (isPresentationCandidate(candidate)) {
    throw failure(
      'SERE_PRESENTATION_NOT_AUTHORITATIVE',
      'HTML, PDF or Markdown presentation has no authority; authority resides in data, evidence and verifiers.'
    );
  }
  if (candidate.schema !== DOSSIER_SCHEMA) {
    throw failure('SERE_DOSSIER_SCHEMA_INVALID');
  }
  const invalidBoundary = [
    candidate.promotionEligible !== false,
    candidate.authorizesPromotion !== false,
    candidate.authorityModel?.presentationHasAuthority !== false
  ].some(Boolean);
  if (invalidBoundary) {
    throw failure('SERE_AUTHORITY_BOUNDARY_VIOLATION');
  }
  return candidate;
}

function stripKey(object, key) {
  const copy = { ...object };
  delete copy[key];
  return copy;
}

function checkItemHash(item, spec, issues) {
  const { hashKey, label } = spec;
  if (!item || typeof item !== 'object') {
    issues.push(`${label}:missing`);
    return;
  }
  const expected = fingerprint(stripKey(item, hashKey));
  if (item[hashKey] !== expected) {
    const id = item.id ?? 'section';
    issues.push(`${label}:${id}:hash-mismatch`);
  }
}

function checkItemListHashes(items, spec, issues) {
  for (const item of items ?? []) {
    checkItemHash(item, spec, issues);
  }
}

function verifyObservationGroupHashes(observations, issues) {
  checkItemListHashes(observations?.items, { hashKey: 'observationHash', label: 'observation' }, issues);
  for (const group of observations?.bySource ?? []) {
    const groupBody = {
      source: group.source,
      count: group.count,
      observationIds: group.observationIds,
      observationHashes: group.observationHashes
    };
    if (group.sourceGroupHash !== fingerprint(groupBody)) {
      issues.push(`observation-group:${group.source}:hash-mismatch`);
    }
  }
  checkItemHash(observations, { hashKey: 'sectionHash', label: 'section-observations' }, issues);
}

function verifyChronologyHashes(chronology, issues) {
  checkItemListHashes(chronology?.items, { hashKey: 'eventHash', label: 'chronology-event' }, issues);
  for (const bucket of chronology?.buckets ?? []) {
    const summaryBody = {
      bucketIndex: bucket.bucketIndex,
      phase: bucket.phase,
      startedAt: bucket.startedAt,
      endedAt: bucket.endedAt,
      eventIds: bucket.eventIds
    };
    if (bucket.bucketHash !== fingerprint(summaryBody)) {
      issues.push(`chronology-bucket:${bucket.bucketIndex}:hash-mismatch`);
    }
  }
  checkItemHash(chronology, { hashKey: 'sectionHash', label: 'section-chronology' }, issues);
}

function verifyHypothesesHashes(hypotheses, issues) {
  for (const hyp of hypotheses?.items ?? []) {
    checkItemListHashes(hyp.confirmations, { hashKey: 'confirmationHash', label: 'confirmation' }, issues);
    checkItemListHashes(hyp.refutations, { hashKey: 'refutationHash', label: 'refutation' }, issues);
    checkItemListHashes(hyp.unknowns, { hashKey: 'unknownHash', label: 'unknown' }, issues);
    checkItemHash(hyp, { hashKey: 'hypothesisHash', label: 'hypothesis' }, issues);
  }
  checkItemListHashes(hypotheses?.unknowns, { hashKey: 'unknownHash', label: 'unknown' }, issues);
  checkItemHash(hypotheses, { hashKey: 'sectionHash', label: 'section-hypotheses' }, issues);
}

function verifyOperationalHashes(dossier, issues) {
  checkItemListHashes(dossier.actions?.authorized, { hashKey: 'authorizedActionHash', label: 'authorized-action' }, issues);
  checkItemListHashes(dossier.actions?.executed, { hashKey: 'executedActionHash', label: 'executed-action' }, issues);
  checkItemHash(dossier.actions, { hashKey: 'sectionHash', label: 'section-actions' }, issues);
  checkItemListHashes(dossier.beforeAfter?.items, { hashKey: 'diffHash', label: 'diff' }, issues);
  checkItemHash(dossier.beforeAfter, { hashKey: 'sectionHash', label: 'section-beforeAfter' }, issues);
  checkItemListHashes(dossier.visibilityLimitations?.items, { hashKey: 'limitationHash', label: 'limitation' }, issues);
  checkItemHash(dossier.visibilityLimitations, { hashKey: 'sectionHash', label: 'section-visibilityLimitations' }, issues);
  checkItemListHashes(dossier.decisions?.items, { hashKey: 'decisionHash', label: 'decision' }, issues);
  checkItemHash(dossier.decisions, { hashKey: 'sectionHash', label: 'section-decisions' }, issues);
}

function verifyDossierHashes(dossier) {
  const issues = [];
  checkItemHash(dossier.mandate, { hashKey: 'mandateHash', label: 'mandate' }, issues);
  verifyObservationGroupHashes(dossier.observations, issues);
  verifyChronologyHashes(dossier.chronology, issues);
  verifyHypothesesHashes(dossier.hypotheses, issues);
  verifyOperationalHashes(dossier, issues);
  checkItemHash(dossier, { hashKey: 'dossierHash', label: 'dossier' }, issues);
  return issues;
}

function buildKnownIndex(dossier) {
  const obsList = dossier.observations?.items ?? [];
  const obsById = new Map(obsList.map((item) => [item.id, item]));
  const hypById = new Map((dossier.hypotheses?.items ?? []).map((item) => [item.id, item]));
  const execById = new Map((dossier.actions?.executed ?? []).map((item) => [item.id, item]));
  const authById = new Map((dossier.actions?.authorized ?? []).map((item) => [item.id, item]));
  const diffById = new Map((dossier.beforeAfter?.items ?? []).map((item) => [item.id, item]));
  const limById = new Map((dossier.visibilityLimitations?.items ?? []).map((item) => [item.id, item]));
  const decById = new Map((dossier.decisions?.items ?? []).map((item) => [item.id, item]));
  const allRefs = new Set([
    dossier.mandate?.id,
    dossier.mandate?.mandateHash,
    ...obsById.keys(),
    ...obsList.flatMap((item) => [item.observationHash, item.artifactHash]),
    ...hypById.keys(),
    ...execById.keys(),
    ...authById.keys(),
    ...diffById.keys(),
    ...limById.keys(),
    ...decById.keys()
  ].filter(Boolean));
  return { obsById, hypById, execById, authById, diffById, limById, decById, allRefs };
}

function checkChronologyEventOrderAndRefs(events, allRefs, violations) {
  for (let idx = 0; idx < events.length; idx += 1) {
    const current = events[idx];
    if (idx > 0 && Date.parse(current.occurredAt) < Date.parse(events[idx - 1].occurredAt)) {
      violations.push(`chronology-order-invalid:${current.id}`);
    }
    for (const ref of current.evidenceRefs ?? []) {
      if (!allRefs.has(ref)) violations.push(`chronology-evidence-unresolved:${current.id}:${ref}`);
    }
  }
}

function checkObservationsAndChronology(dossier, index, violations) {
  for (const obs of dossier.observations?.items ?? []) {
    if (!obs.inScope) violations.push(`observation-out-of-scope:${obs.id}`);
  }
  checkChronologyEventOrderAndRefs(dossier.chronology?.items ?? [], index.allRefs, violations);
}

function verifySingleConfirmation(conf, hyp, ctx) {
  const obs = ctx.index.obsById.get(conf.observationId);
  if (!obs) {
    ctx.violations.push(`confirmation-observation-unknown:${conf.id}`);
    return false;
  }
  const validHash = [obs.artifactHash, obs.observationHash].includes(conf.evidenceHash);
  if (!validHash) {
    ctx.violations.push(`confirmation-evidence-hash-mismatch:${conf.id}`);
  }
  const independent = [
    conf.independent === true,
    conf.verifierId !== obs.producerId,
    conf.verifierId !== hyp.proposedBy
  ].every(Boolean);
  if (conf.independent && !independent) {
    ctx.violations.push(`confirmation-independence-invalid:${conf.id}`);
  }
  return independent;
}

function checkHypothesisStatusRules(hyp, independentVerifiersCount, ctx) {
  const refutationCount = (hyp.refutations ?? []).length;
  if (hyp.status === 'confirmed' && refutationCount > 0) {
    ctx.violations.push(`hypothesis-refutation-dominates:${hyp.id}`);
  }
  if (hyp.status === 'confirmed' && independentVerifiersCount < ctx.minQuorum) {
    ctx.violations.push(`hypothesis-unverified-confirmation:${hyp.id}`);
  }
  if (hyp.status === 'refuted' && refutationCount === 0) {
    ctx.violations.push(`hypothesis-refutation-missing:${hyp.id}`);
  }
}

function verifySingleHypothesis(hyp, ctx) {
  const independentVerifiers = new Set();
  for (const conf of hyp.confirmations ?? []) {
    if (verifySingleConfirmation(conf, hyp, ctx)) {
      independentVerifiers.add(conf.verifierId);
    }
  }
  for (const ref of hyp.refutations ?? []) {
    if (!ctx.index.obsById.has(ref.observationId)) {
      ctx.violations.push(`refutation-observation-unknown:${ref.id}`);
    }
  }
  checkHypothesisStatusRules(hyp, independentVerifiers.size, ctx);
}

function checkHypothesesSection(dossier, ctx) {
  const minQuorum = Math.max(1, Number(ctx.options?.minIndependentVerifiers ?? 1));
  for (const hyp of dossier.hypotheses?.items ?? []) {
    verifySingleHypothesis(hyp, { ...ctx, minQuorum });
  }
  const unknownsCount = (dossier.hypotheses?.unknowns ?? []).length;
  if (ctx.options?.requireExplicitUnknowns !== false && unknownsCount === 0) {
    ctx.violations.push('hypotheses-unknowns-missing');
  }
}

function checkActionsSection(actions, violations) {
  for (const unauthorizedId of actions?.reconciliation?.unauthorizedExecuted ?? []) {
    violations.push(`unauthorized-action-executed:${unauthorizedId}`);
  }
  for (const exec of actions?.executed ?? []) {
    const validExec = [exec.inScope, exec.authorized].every(Boolean);
    if (!validExec) violations.push(`action-not-authorized-or-in-scope:${exec.id}`);
  }
}

function checkDiffsSection(beforeAfter, execById, violations) {
  for (const diff of beforeAfter?.items ?? []) {
    const missingActions = (diff.actionIds ?? []).filter((id) => !execById.has(id));
    for (const actionId of missingActions) {
      violations.push(`diff-action-unknown:${diff.id}:${actionId}`);
    }
    if ((diff.before.digest !== diff.after.digest) !== diff.delta.changed) {
      violations.push(`diff-delta-inconsistent:${diff.id}`);
    }
  }
}

function checkActionsAndDiffs(dossier, index, violations) {
  checkActionsSection(dossier.actions, violations);
  checkDiffsSection(dossier.beforeAfter, index.execById, violations);
}

function checkLimitationsAndDecisions(dossier, index, violations) {
  for (const lim of dossier.visibilityLimitations?.items ?? []) {
    const unknownHyps = (lim.affectedHypothesisIds ?? []).filter((id) => !index.hypById.has(id));
    for (const hypId of unknownHyps) violations.push(`limitation-hypothesis-unknown:${lim.id}:${hypId}`);
  }
  for (const dec of dossier.decisions?.items ?? []) {
    const unresolved = (dec.evidenceRefs ?? []).filter((ref) => !index.allRefs.has(ref));
    for (const ref of unresolved) violations.push(`decision-evidence-unresolved:${dec.id}:${ref}`);
  }
}

function hasList(list) {
  return Array.isArray(list) && list.length > 0;
}

function checkCompleteness(dossier) {
  const requiredSections = [
    ['mandate', [Boolean(dossier.mandate?.id), hasList(dossier.mandate?.scope?.inScopeTargets)].every(Boolean)],
    ['observations', [hasList(dossier.observations?.items), hasList(dossier.observations?.bySource)].every(Boolean)],
    ['chronology', [hasList(dossier.chronology?.items), hasList(dossier.chronology?.buckets)].every(Boolean)],
    ['hypotheses', hasList(dossier.hypotheses?.items)],
    ['actions', [hasList(dossier.actions?.authorized), Array.isArray(dossier.actions?.executed)].every(Boolean)],
    ['beforeAfter', hasList(dossier.beforeAfter?.items)],
    ['visibilityLimitations', hasList(dossier.visibilityLimitations?.items)],
    ['decisions', hasList(dossier.decisions?.items)]
  ];
  const missingSections = requiredSections.filter(([, ok]) => !ok).map(([name]) => name);
  return { complete: missingSections.length === 0, missingSections };
}

function resolveVerificationStatus(integrityIssues, allViolations) {
  if (integrityIssues.length > 0) return 'quarantined';
  if (allViolations.length > 0) return 'rejected';
  return 'verified';
}

function verifySereDossier(dossier, options = {}) {
  assertAuthoritativeSource(dossier);
  const integrityIssues = verifyDossierHashes(dossier);
  const completeness = checkCompleteness(dossier);
  const violations = [...completeness.missingSections.map((sec) => `missing-section:${sec}`)];
  const index = buildKnownIndex(dossier);
  checkObservationsAndChronology(dossier, index, violations);
  checkHypothesesSection(dossier, { index, options, violations });
  checkActionsAndDiffs(dossier, index, violations);
  checkLimitationsAndDecisions(dossier, index, violations);
  const allViolations = [...new Set([...integrityIssues, ...violations])].sort();
  const status = resolveVerificationStatus(integrityIssues, allViolations);
  const body = {
    schema: VERIFICATION_SCHEMA,
    reportId: dossier.reportId,
    dossierHash: dossier.dossierHash,
    verifierId: String(options.verifierId ?? 'sere-deterministic-verifier').trim(),
    status,
    complete: completeness.complete,
    exact: allViolations.length === 0,
    integrityOk: integrityIssues.length === 0,
    missingSections: completeness.missingSections,
    integrityIssues: [...new Set(integrityIssues)].sort(),
    violations: allViolations,
    promotionEligible: false,
    authorizesPromotion: false
  };
  return { ...body, verificationHash: fingerprint(body) };
}

function verifySereReproducibility(rawInput, dossier) {
  assertAuthoritativeSource(dossier);
  const rebuilt = assembleSereDossier(rawInput);
  const reproducible = rebuilt.dossierHash === dossier.dossierHash
    && canonicalJson(rebuilt) === canonicalJson(dossier);
  return {
    reproducible,
    expectedDossierHash: dossier.dossierHash,
    rebuiltDossierHash: rebuilt.dossierHash
  };
}

module.exports = {
  assertAuthoritativeSource,
  verifyDossierHashes,
  verifySereDossier,
  verifySereReproducibility
};

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { computeDigest } = require('../src/services/securityEvidenceReport/serePrimitives');
const sere = require('../src/services/securityEvidenceReport/sereEngineService');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');
const { buildAntigenGraph } = require('../src/services/securityRemediation/antigenGraphService');
const { planRemediationCampaign } = require('../src/services/securityRemediation/remediationCampaignPlanner');
const adjudicator = require('../src/services/securityRemediation/campaignAdjudicator');

function sampleMandate() {
  return {
    id: 'mandate-sec-2026-04',
    title: 'Audit et remédiation de la frontière HTTP/SQL',
    issuer: 'security-governance-board',
    issuedAt: '2026-10-22T08:00:00.000Z',
    validUntil: '2026-10-23T08:00:00.000Z',
    scope: {
      inScopeTargets: ['src/users.js', 'src/orders.js', 'src/auth/*'],
      outOfScopeTargets: ['billing/*', 'external/*'],
      authorizedCategories: ['static_analysis', 'isolated_reproduction', 'patch_verification'],
      rulesOfEngagement: ['no_live_exploit', 'isolated_cow_workspace_only']
    }
  };
}

function sampleObservations() {
  return [
    {
      id: 'obs-scan-1', source: 'scanner', producerId: 'scanner-codeql', verifierId: 'verifier-static-1',
      observedAt: '2026-10-22T09:00:00.000Z', target: 'src/users.js', severity: 'high',
      summary: 'Flux SQL non paramétré détecté dans src/users.js:18',
      artifactRef: 'sarif://run-1/users-sql', artifactHash: computeDigest('sarif-users-sql'),
      metrics: { alerts: 1, line: 18 }
    },
    {
      id: 'obs-probe-1', source: 'forensic_trace', producerId: 'red-fixture-runner', verifierId: 'verifier-runtime-2',
      observedAt: '2026-10-22T09:05:00.000Z', target: 'src/orders.js', severity: 'info',
      summary: 'Contre-exemple : le contournement regex laisse passer une charge utile encodée',
      artifactRef: 'trace://fixture/orders-counterexample', artifactHash: computeDigest('trace-orders-counterexample'),
      metrics: { bypassed: true }
    },
    {
      id: 'obs-verif-1', source: 'verifier_receipt', producerId: 'patch-worker-1', verifierId: 'verifier-quorum-a',
      observedAt: '2026-10-22T09:20:00.000Z', target: 'src/users.js', severity: 'info',
      summary: 'Requêtes préparées vérifiées : 0 alerte restante et invariants fonctionnels intacts',
      artifactRef: 'receipt://verifier-quorum-a/users', artifactHash: computeDigest('receipt-verifier-quorum-a-users'),
      metrics: { alerts: 0, invariantFailures: 0 }
    }
  ];
}

function sampleChronology() {
  return [
    { id: 'evt-01', occurredAt: '2026-10-22T08:05:00.000Z', sequence: 1, phase: 'mandate', kind: 'mandate_sealed', actorId: 'security-governance-board', summary: 'Scellement du mandat et du périmètre d’audit', evidenceRefs: ['mandate-sec-2026-04'] },
    { id: 'evt-02', occurredAt: '2026-10-22T09:00:00.000Z', sequence: 2, phase: 'observation', kind: 'scanner_ingestion', actorId: 'scanner-codeql', summary: 'Collecte de l’observation scanner sur src/users.js', evidenceRefs: ['obs-scan-1'] },
    { id: 'evt-03', occurredAt: '2026-10-22T09:15:00.000Z', sequence: 3, phase: 'action', kind: 'remediation_applied', actorId: 'patch-worker-1', summary: 'Application du correctif paramétré en workspace isolé', evidenceRefs: ['act-exec-1'] },
    { id: 'evt-04', occurredAt: '2026-10-22T09:25:00.000Z', sequence: 4, phase: 'verification', kind: 'diff_verified', actorId: 'verifier-quorum-a', summary: 'Vérification indépendante du diff avant/après et clôture', evidenceRefs: ['obs-verif-1', 'diff-users-1', 'dec-sec-1'] }
  ];
}

function sampleHypotheses() {
  return {
    items: [
      {
        id: 'hyp-parameterized-fix',
        statement: 'La paramétrisation stricte élimine le flux SQL injectable dans src/users.js sans régression.',
        proposedBy: 'patch-worker-1',
        status: 'confirmed',
        confirmations: [{
          id: 'conf-1', observationId: 'obs-verif-1', verifierId: 'verifier-quorum-a', independent: true,
          rationale: 'Vérificateur indépendant confirme 0 alerte et blocage du chemin vulnérable.',
          evidenceHash: computeDigest('receipt-verifier-quorum-a-users')
        }],
        refutations: [],
        unknowns: [{
          id: 'unk-orm-cache', area: 'cache-secondaire',
          description: 'Comportement du cache distribué sous charge extrême non rejoué.',
          impact: 'Latence potentielle hors périmètre fonctionnel.', mitigationRef: 'lim-no-prod-traffic'
        }]
      },
      {
        id: 'hyp-regex-filter',
        statement: 'Un simple filtre regex suffit à bloquer l’injection sur src/orders.js.',
        proposedBy: 'patch-worker-2',
        status: 'refuted',
        confirmations: [],
        refutations: [{
          id: 'ref-1', observationId: 'obs-probe-1', verifierId: 'verifier-runtime-2', independent: true,
          counterexample: 'Charge utile encodée contourne le filtre regex dans la fixture.',
          evidenceHash: computeDigest('trace-orders-counterexample')
        }],
        unknowns: []
      }
    ],
    unknowns: [{
      id: 'unk-external-waf', area: 'waf-amont',
      description: 'Règles WAF opérateur externe non inspectables depuis la capsule.',
      impact: 'La défense en profondeur externe reste non mesurée.', mitigationRef: 'lim-no-prod-traffic'
    }]
  };
}

function sampleOperationalSections() {
  return {
    actions: {
      authorized: [
        { id: 'act-auth-1', actionType: 'apply_isolated_patch', target: 'src/users.js', commandOrTool: 'genos_workspace_patch', authorizedBy: 'security-governance-board', leaseRef: 'lease-sec-2026-04-a' },
        { id: 'act-auth-2', actionType: 'run_optional_fuzz', target: 'src/orders.js', commandOrTool: 'genos_safe_fuzzer', authorizedBy: 'security-governance-board', leaseRef: 'lease-sec-2026-04-b' }
      ],
      executed: [
        { id: 'act-exec-1', authorizedActionId: 'act-auth-1', actionType: 'apply_isolated_patch', target: 'src/users.js', actorId: 'patch-worker-1', executedAt: '2026-10-22T09:15:00.000Z', status: 'succeeded', receiptRef: 'receipt://exec/act-exec-1', receiptHash: computeDigest('exec-receipt-1') }
      ]
    },
    beforeAfter: [{
      id: 'diff-users-1', target: 'src/users.js', category: 'code',
      before: { snapshotId: 'snap-users-before', digest: computeDigest('users-before-state'), summary: 'Concaténation SQL directe ligne 18', metrics: { alerts: 1, invariantFailures: 0 } },
      after: { snapshotId: 'snap-users-after', digest: computeDigest('users-after-state'), summary: 'Requête préparée avec paramètres liés ligne 18', metrics: { alerts: 0, invariantFailures: 0 } },
      delta: { changed: true, summary: 'Remplacement de la concaténation par une requête paramétrée', added: ['db.prepare(sql, [userId])'], removed: ['db.exec("SELECT ... " + userId)'], metricDelta: { alerts: -1, diffLines: 6 } },
      actionIds: ['act-exec-1'], verifierId: 'verifier-quorum-a', verifierReceiptHash: computeDigest('receipt-verifier-quorum-a-users')
    }],
    visibilityLimitations: [{
      id: 'lim-no-prod-traffic', scope: 'src/users.js', category: 'isolated_environment',
      description: 'Aucun trafic de production ni WAF externe n’est présent dans la capsule.',
      reason: 'Confinement de sécurité interdisant le réseau et l’accès aux cibles vivantes.',
      impactOnConclusion: 'La preuve établit la correction sur la fixture locale, sans certifier la topologie réseau de production.',
      affectedHypothesisIds: ['hyp-parameterized-fix']
    }],
    decisions: [{
      id: 'dec-sec-1', title: 'Valider le correctif paramétré pour soumission à la porte de promotion humaine',
      disposition: 'remediate',
      responsible: { actorId: 'sec-officer-01', name: 'Claire Moreau', role: 'responsable_securite', authorityRef: 'mandate://security-governance-board/charter-4' },
      decidedAt: '2026-10-22T09:30:00.000Z',
      rationale: 'Hypothèse confirmée par vérificateur indépendant et réfutation du filtre regex documentée.',
      evidenceRefs: ['obs-verif-1', 'hyp-parameterized-fix', 'diff-users-1', 'lim-no-prod-traffic'],
      receiptHash: computeDigest('decision-sec-1-receipt')
    }]
  };
}

function sampleReportInput() {
  return {
    reportId: 'sere-report-2026-001',
    mandate: sampleMandate(),
    observations: sampleObservations(),
    chronology: sampleChronology(),
    hypotheses: sampleHypotheses(),
    ...sampleOperationalSections()
  };
}

function testCompleteAssemblyAndExport(rootDir) {
  const input = sampleReportInput();
  const report = sere.assembleSecurityEvidenceReport(input);
  assert.equal(report.schema, sere.BUNDLE_SCHEMA);
  assert.equal(report.verification.status, 'verified');
  assert.equal(report.verification.complete, true);
  assert.equal(report.verification.exact, true);
  assert.equal(report.reproducibility.reproducible, true);
  assert.equal(report.presentationCheck.ok, true);
  assert.equal(report.dossier.promotionEligible, false);
  assert.equal(report.dossier.authorizesPromotion, false);
  assert.equal(report.juryDocument.authority, 'none');
  assert.equal(report.juryDocument.isPresentationOnly, true);
  assert.deepEqual(report.dossier.observations.sources, ['forensic_trace', 'scanner', 'verifier_receipt']);
  assert.deepEqual(report.dossier.actions.reconciliation.authorizedAndExecuted, ['act-exec-1']);
  assert.deepEqual(report.dossier.actions.reconciliation.authorizedNotExecuted, ['act-auth-2']);
  assert.deepEqual(report.dossier.actions.reconciliation.unauthorizedExecuted, []);

  const permuted = { ...input, observations: [...input.observations].reverse(), chronology: [...input.chronology].reverse() };
  const rebuilt = sere.assembleSecurityEvidenceReport(permuted);
  assert.equal(rebuilt.dossier.dossierHash, report.dossier.dossierHash);

  const exportDir = path.join(rootDir, 'exported-bundle');
  sere.exportSereBundle(report, exportDir);
  const verifiedDisk = sere.verifyExportedSereBundle(exportDir);
  assert.equal(verifiedDisk.verified, true);
  assert.equal(verifiedDisk.dossierHash, report.dossier.dossierHash);
  const presentationPath = path.join(exportDir, 'presentation.json');
  const originalPresentation = fs.readFileSync(presentationPath, 'utf8');
  fs.writeFileSync(presentationPath, `${originalPresentation} `, 'utf8');
  assert.throws(() => sere.verifyExportedSereBundle(exportDir), { code: 'SERE_EXPORTED_FILE_TAMPERED' });
  fs.writeFileSync(presentationPath, originalPresentation, 'utf8');
  return { report, exportDir };
}

function testPresentationHasNoAuthority(report, exportDir) {
  assert.throws(() => sere.assertAuthoritativeSource(report.juryDocument), { code: 'SERE_PRESENTATION_NOT_AUTHORITATIVE' });
  assert.throws(() => sere.verifySereDossier({ html: '<html><body>Fake jury report</body></html>' }), { code: 'SERE_PRESENTATION_NOT_AUTHORITATIVE' });

  const tamperedPresentation = { ...report.juryDocument, markdown: `${report.juryDocument.markdown}\n- [obs:fabricated-observation]` };
  const check = sere.verifyJuryPresentation(report.dossier, tamperedPresentation);
  assert.equal(check.ok, false);
  assert.deepEqual(check.fabricatedTags, ['[obs:fabricated-observation]']);

  const htmlPath = path.join(exportDir, 'jury-report.html');
  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  fs.writeFileSync(htmlPath, `${originalHtml}<!-- altered -->`, 'utf8');
  assert.throws(() => sere.verifyExportedSereBundle(exportDir), { code: 'SERE_EXPORTED_FILE_TAMPERED' });
  fs.writeFileSync(htmlPath, originalHtml, 'utf8');
}

function testVerifierRejectsInvalidDossiers() {
  const unauthorizedInput = sampleReportInput();
  unauthorizedInput.actions.executed.push({
    id: 'act-exec-rogue', authorizedActionId: null, actionType: 'live_exploit', target: 'billing/cards.js',
    actorId: 'rogue-agent', executedAt: '2026-10-22T09:16:00.000Z', status: 'succeeded',
    receiptRef: 'receipt://rogue', receiptHash: computeDigest('rogue-receipt')
  });
  assert.throws(() => sere.assembleSecurityEvidenceReport(unauthorizedInput), { code: 'SERE_VERIFICATION_FAILED' });
  const rogueDossier = sere.assembleSereDossier(unauthorizedInput);
  const rogueVerif = sere.verifySereDossier(rogueDossier);
  assert.equal(rogueVerif.status, 'rejected');
  assert.ok(rogueVerif.violations.includes('unauthorized-action-executed:act-exec-rogue'));

  const tamperedDossier = { ...rogueDossier, mandate: { ...rogueDossier.mandate, title: 'Mandat falsifié après coup' } };
  const quarantined = sere.verifySereDossier(tamperedDossier);
  assert.equal(quarantined.status, 'quarantined');
  assert.ok(quarantined.integrityIssues.some((issue) => issue.includes('hash-mismatch')));

  const conflictMandate = sampleReportInput();
  conflictMandate.mandate.scope.outOfScopeTargets = ['src/users.js'];
  assert.throws(() => sere.assembleSereDossier(conflictMandate), { code: 'SERE_MANDATE_SCOPE_CONFLICT' });

  const refutedClaimedConfirmed = sampleReportInput();
  refutedClaimedConfirmed.hypotheses.items[0].refutations = [{
    id: 'ref-conflict', observationId: 'obs-probe-1', verifierId: 'verifier-runtime-2', independent: true,
    counterexample: 'Contre-exemple contredisant la confirmation', evidenceHash: computeDigest('trace-orders-counterexample')
  }];
  const badHypVerif = sere.verifySereDossier(sere.assembleSereDossier(refutedClaimedConfirmed));
  assert.equal(badHypVerif.status, 'rejected');
  assert.ok(badHypVerif.violations.includes('hypothesis-refutation-dominates:hyp-parameterized-fix'));
}

function buildCampaignVerifierReceipt(cand, verifierId, isControl) {
  return adjudicator.createVerifierReceipt({
    candidateId: cand.id,
    verifierId,
    status: 'verified',
    evidenceRef: `test://fixture/${cand.id}/${verifierId}`,
    checks: {
      scannerOutcome: isControl ? 'present' : 'cleared',
      safePathReproduction: isControl ? 'reachable' : 'blocked',
      functionalInvariants: 'passed',
      newHazards: 'none',
      metrics: { remainingAlerts: isControl ? 1 : 0, invariantFailures: 0, newHazards: 0, diffLines: isControl ? 0 : 8 }
    }
  });
}

function testRemediationCampaignBridge() {
  const batch = ingestSecurityAlerts({
    alerts: [{
      externalId: 'sql-a', ruleId: 'codeql/sql', cwes: ['CWE-89'], trustBoundary: 'http-to-db',
      sourceKind: 'request', sinkKind: 'sql', message: 'Unsafe SQL flow.', location: { path: 'src/users.js', line: 8 }
    }]
  });
  const graph = buildAntigenGraph(batch);
  const campaign = planRemediationCampaign(graph, { sourceDigest: 'sha256:fixture-revision', producerId: 'patch-producer', campaignSeed: 'sere-bridge' });
  const byFamily = Object.fromEntries(campaign.candidates.map((item) => [item.family, item]));
  const receipts = [
    ...['verifier-a', 'verifier-b'].map((id) => buildCampaignVerifierReceipt(byFamily.control, id, true)),
    ...['verifier-a', 'verifier-b'].map((id) => buildCampaignVerifierReceipt(byFamily.structural_fix, id, false))
  ];
  const adjudication = adjudicator.adjudicateCampaign(campaign, receipts);
  const baseEvidence = sampleReportInput();
  const receiptObservations = receipts.map((receipt, index) => ({
    id: `obs-campaign-receipt-${index + 1}`,
    source: 'verifier_receipt',
    producerId: campaign.producerId,
    verifierId: receipt.verifierId,
    observedAt: `2026-10-22T09:40:0${index}.000Z`,
    target: 'src/users.js',
    severity: receipt.status === 'verified' ? 'info' : 'warning',
    summary: `Recorded verifier result for ${receipt.candidateId}.`,
    artifactRef: receipt.evidenceRef,
    artifactHash: receipt.receiptHash,
    metrics: receipt.checks.metrics
  }));
  const chronology = [
    ...baseEvidence.chronology,
    ...receiptObservations.map((observation, index) => ({
      id: `evt-campaign-receipt-${index + 1}`,
      occurredAt: observation.observedAt,
      sequence: 5 + index,
      phase: 'verification',
      kind: 'independent_verifier_receipt',
      actorId: observation.verifierId,
      summary: observation.summary,
      evidenceRefs: [observation.id]
    }))
  ];
  const reportEvidence = {
    observations: [...baseEvidence.observations, ...receiptObservations],
    chronology,
    unknowns: baseEvidence.hypotheses.unknowns,
    actions: baseEvidence.actions,
    beforeAfter: baseEvidence.beforeAfter,
    visibilityLimitations: baseEvidence.visibilityLimitations.map((lim) => ({
      ...lim,
      affectedHypothesisIds: [`hyp-${byFamily.structural_fix.id}`]
    })),
    decisions: baseEvidence.decisions.map((decision) => ({
      ...decision,
      evidenceRefs: ['obs-verif-1', `hyp-${byFamily.structural_fix.id}`, 'diff-users-1', 'lim-no-prod-traffic']
    }))
  };
  const bridgeInput = {
    reportId: 'sere-campaign-bridge', mandate: sampleMandate(), campaign, receipts, adjudication,
    reportEvidence
  };
  assert.throws(
    () => sere.assembleReportFromRemediationCampaign({ ...bridgeInput, reportEvidence: undefined }),
    { code: 'SERE_CAMPAIGN_REPORT_EVIDENCE_REQUIRED' },
  );
  assert.throws(
    () => sere.assembleReportFromRemediationCampaign({
      ...bridgeInput, adjudication: { ...adjudication, outcomes: [] }
    }),
    { code: 'SERE_CAMPAIGN_ADJUDICATION_MISMATCH' },
  );
  const bundle = sere.assembleReportFromRemediationCampaign(bridgeInput);
  assert.equal(bundle.verification.status, 'verified');
  assert.equal(bundle.presentationCheck.ok, true);
  assert.equal(bundle.dossier.chronology.items.some((event) => event.id === 'evt-campaign-receipt-1'), true);
  assert.equal(bundle.dossier.actions.executed.length, reportEvidence.actions.executed.length);
  assert.equal(bundle.dossier.observations.items.some((item) => item.observedAt === '2026-10-22T09:40:00.000Z'), true);
}

function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-sere-test-'));
  try {
    const { report, exportDir } = testCompleteAssemblyAndExport(rootDir);
    testPresentationHasNoAuthority(report, exportDir);
    testVerifierRejectsInvalidDossiers();
    testRemediationCampaignBridge();
    console.log('SERE (Security Evidence Report Engine): assembly, machine verification and jury presentation passed.');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { main };

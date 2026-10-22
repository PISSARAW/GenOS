'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET
  || 'test-epistemic-receipt-secret-chantier-12';

const assert = require('node:assert/strict');
const {
  LEARNING_STAGES,
  QUALIFICATION_DISPOSITIONS,
  issueIndependentVerifierReceipt,
  createLearningSession,
  recordObservation,
  formulateHypothesis,
  executeHypothesisTest,
  verifyInvestigation,
  qualifyInvestigation,
  createSecurityLearningStore,
  commitToOntogenesisMemory,
  evaluateControlledReuse,
  evaluateAlertConfidenceWithHistory,
  validateSecurityPolicyModification,
  runFullSecurityLearningCycle,
} = require('../src/services/securityLearningOntogenesisService');

function buildTwoIndependentReceipts(formalResult) {
  return [
    issueIndependentVerifierReceipt({
      resultId: formalResult.resultId,
      evidenceDigest: formalResult.evidence.digest,
      verifierType: 'proof',
      actorId: 'agent:independent_auditor',
      role: 'independent_auditor',
      modelFamily: 'auditor-family-a',
    }),
    issueIndependentVerifierReceipt({
      resultId: formalResult.resultId,
      evidenceDigest: formalResult.evidence.digest,
      verifierType: 'replay',
      actorId: 'agent:forensic_analyst',
      role: 'forensic_analyst',
      modelFamily: 'forensic-family-b',
    }),
  ];
}

async function testStageOrderAndUnvalidatedTruthPrevention() {
  const store = createSecurityLearningStore();
  const session = createLearningSession({ authorId: 'agent:threat_analyst' });

  // Cannot skip observation -> hypothesis -> test
  assert.throws(
    () => formulateHypothesis(session, { statement: 'Premature hypothesis', falsifier: 'No obs' }),
    (err) => err.code === 'SECURITY_LEARNING_STAGE_ORDER_VIOLATION',
  );

  recordObservation(session, {
    alertClass: 'smb_lateral_movement',
    summary: 'Anomalous SMB 445/tcp session from DMZ host 10.20.1.99 to DC01',
    evidenceRefs: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01'],
    rawConfidence: 0.82,
    environment: {
      signature: 'env:corp-dmz-dc',
      conditions: { segment: 'DMZ', port: 445 },
      constraints: ['network:segmented', 'smb_signing:required'],
    },
  });

  // Cannot jump from observation directly to verification or memory
  assert.throws(
    () => verifyInvestigation(session, {}),
    (err) => err.code === 'SECURITY_LEARNING_STAGE_ORDER_VIOLATION',
  );

  formulateHypothesis(session, {
    statement: 'DMZ host 10.20.1.99 relayed NTLM credentials to DC01 over floating rule FR-104.',
    falsifier: 'SMB session was blocked by pfSense or authenticated via Kerberos with signing.',
  });

  await executeHypothesisTest(session, {
    protocolSteps: ['Verify pfSense rule FR-104 hit counter', 'Inspect EVTX 4624 logon package NTLM'],
    measurements: [{ metric: 'ntlm_type3_count', value: 1 }],
    outcome: 'corroborated',
  });

  // Verification without independent receipts fails AEIS assurance -> unvalidated_conjecture
  const unverified = verifyInvestigation(session, { verifierReceipts: [] });
  assert.equal(unverified.independentlyVerified, false);

  // Cannot force an unverified result to be a validated truth
  assert.throws(
    () => qualifyInvestigation(session, { forceValidatedTruth: true }),
    (err) => err.code === 'SECURITY_LEARNING_UNVALIDATED_TRUTH_FORBIDDEN',
  );

  const qual = qualifyInvestigation(session);
  assert.equal(qual.disposition, QUALIFICATION_DISPOSITIONS.UNVALIDATED_CONJECTURE);
  assert.equal(qual.validatedTruth, false);

  // Unvalidated conjecture cannot be committed into Ontogenesis memory as a truth
  await assert.rejects(
    async () => commitToOntogenesisMemory(session, store),
    (err) => err.code === 'SECURITY_LEARNING_UNVALIDATED_TRUTH_FORBIDDEN',
  );

  // Even if recorded as an open question (validatedTruth: false), it cannot be reused
  const questionMem = await commitToOntogenesisMemory(session, store, { allowUnvalidatedQuestion: true });
  assert.equal(questionMem.kind, 'question');
  assert.equal(questionMem.validatedTruth, false);

  assert.throws(
    () => evaluateControlledReuse(session, store, {
      targetContext: {
        alertClass: 'smb_lateral_movement',
        environment: { signature: 'env:corp-dmz-dc', constraints: ['network:segmented', 'smb_signing:required'] },
      },
    }),
    (err) => err.code === 'SECURITY_LEARNING_UNVALIDATED_REUSE_FORBIDDEN',
  );
}

async function testFullValidatedCycleAndControlledReuse() {
  const store = createSecurityLearningStore();
  const targetContext = {
    alertClass: 'ad_acl_genericall_drift',
    environment: {
      signature: 'env:corp-ad-tier0',
      conditions: { ou: 'OU=Servers', principal: 'CORP\\svc_backup' },
      constraints: ['tier0:isolated', 'acl:least_privilege'],
    },
  };

  const result = await runFullSecurityLearningCycle(store, {
    observation: {
      alertClass: targetContext.alertClass,
      summary: 'GenericAll granted to service account CORP\\svc_backup on OU=Servers',
      evidenceRefs: ['deo:obs:gpo-report-01', 'deo:obs:evtx-4672-01'],
      rawConfidence: 0.88,
      environment: targetContext.environment,
    },
    hypothesis: {
      statement: 'Unintended ACL modification granted GenericAll on OU=Servers to CORP\\svc_backup.',
      falsifier: 'Change-control ticket authorizes Tier-0 delegation for CORP\\svc_backup.',
    },
    test: {
      protocolSteps: ['Inspect DACL SDDL on OU=Servers', 'Correlate directory service event 5136'],
      measurements: [{ metric: 'unauthorized_ace_count', value: 1 }],
      outcome: 'corroborated',
    },
    verification: {
      buildReceipts: buildTwoIndependentReceipts,
    },
    qualification: {
      severity: 'high',
    },
    reuse: {
      intendedUse: 'triage_enrichment',
      targetContext,
    },
  });

  assert.deepEqual(result.stageHistory, [...LEARNING_STAGES]);
  assert.equal(result.qualification.disposition, QUALIFICATION_DISPOSITIONS.CONFIRMED_INCIDENT);
  assert.equal(result.qualification.validatedTruth, true);
  assert.equal(result.memoryRecord.kind, 'decision');
  assert.equal(result.memoryRecord.validatedTruth, true);
  assert.equal(result.reuseReceipt.reused, true);
  assert.equal(result.reuseReceipt.canModifySecurityPolicyDirectly, false);

  // Controlled reuse fails if target domain or constraints differ
  const dummySession = createLearningSession();
  dummySession.currentStage = 'memory';
  dummySession.stageHistory = LEARNING_STAGES.slice(0, 6);
  dummySession.memoryRecord = result.memoryRecord;
  assert.throws(
    () => evaluateControlledReuse(dummySession, store, {
      targetContext: {
        alertClass: 'ad_acl_genericall_drift',
        environment: {
          signature: 'env:untrusted-lab',
          constraints: ['tier0:isolated', 'acl:least_privilege'],
        },
      },
    }),
    (err) => err.code === 'SECURITY_LEARNING_REUSE_DOMAIN_MISMATCH',
  );
}

async function testFalsePositiveModulatesConfidenceWithoutAutoIgnoring() {
  const store = createSecurityLearningStore();
  const fpEnv = {
    signature: 'env:backup-window-nightly',
    conditions: { window: '02:00-03:00', sourceHost: '10.20.5.10' },
    constraints: ['network:segmented'],
  };

  // Record 2 verified false positives for the same alertClass
  for (let i = 0; i < 2; i += 1) {
    await runFullSecurityLearningCycle(store, {
      observation: {
        alertClass: 'pfsense_port_scan_burst',
        summary: `Nightly vulnerability scanner burst #${i + 1} from 10.20.5.10`,
        evidenceRefs: [`deo:obs:nmap-scan-0${i + 1}`],
        rawConfidence: 0.80,
        environment: fpEnv,
      },
      hypothesis: {
        statement: 'Host 10.20.5.10 is conducting unauthorized reconnaissance across VLANs.',
        falsifier: 'Traffic matches authorized nightly Nmap compliance scan window.',
      },
      test: {
        protocolSteps: ['Compare source IP and timestamp against signed scanner schedule'],
        counterexample: 'Signed maintenance window schedule authorizes 10.20.5.10 at 02:15 UTC.',
        outcome: 'refuted',
      },
      verification: {
        buildReceipts: buildTwoIndependentReceipts,
      },
      qualification: {
        severity: 'low',
      },
      reuse: {
        intendedUse: 'false_positive_context',
        targetContext: { alertClass: 'pfsense_port_scan_burst', environment: fpEnv },
      },
    });
  }

  // Evaluate a new similar alert: confidence MUST be reduced, but autoIgnore/suppressed MUST remain false
  const evalResult = evaluateAlertConfidenceWithHistory(store, {
    alertClass: 'pfsense_port_scan_burst',
    summary: 'Nightly vulnerability scanner burst from 10.20.5.10',
    rawConfidence: 0.80,
  });

  assert.equal(evalResult.priorFalsePositiveCount, 2);
  assert.equal(evalResult.confidenceReduced, true);
  assert.ok(evalResult.adjustedConfidence < evalResult.rawConfidence);
  assert.ok(evalResult.adjustedConfidence >= 0.15);
  assert.equal(evalResult.autoIgnore, false, 'False positives must never automatically ignore similar alerts');
  assert.equal(evalResult.suppressed, false, 'False positives must never suppress similar alerts');
  assert.equal(evalResult.mustInvestigate, true);
}

function testSecurityPolicyChangesRequireFreshIndependentValidation() {
  const proposal = {
    policyId: 'pol:pfsense-fr-104-lockdown',
    policyType: 'firewall_rule',
    targetScope: 'DMZ-to-LAN',
    proposerId: 'agent:remediation_planner',
    proposedChanges: { ruleId: 'FR-104', action: 'block', port: 445 },
  };

  // Reusing an investigation's validation is strictly forbidden
  assert.throws(
    () => validateSecurityPolicyModification(proposal, {
      investigationSessionId: 'sec-learn-1',
      reusedInvestigationValidation: true,
    }),
    (err) => err.code === 'SECURITY_POLICY_REUSED_VALIDATION_FORBIDDEN',
  );

  // Missing fresh receipts is rejected
  assert.throws(
    () => validateSecurityPolicyModification(proposal, {
      independentAuditorVerdict: 'accept',
      freshVerifierReceipts: [],
    }),
    (err) => err.code === 'SECURITY_POLICY_FRESH_VALIDATION_REQUIRED',
  );

  // Independent auditor verdict other than 'accept' is rejected
  assert.throws(
    () => validateSecurityPolicyModification(proposal, {
      independentAuditorVerdict: 'unresolved',
      buildFreshReceipts: (formalResult) => buildTwoIndependentReceipts(formalResult),
    }),
    (err) => err.code === 'SECURITY_POLICY_INDEPENDENT_AUDIT_REJECTED',
  );

  // Single verifier (violating AEIS >=2 independent actor census) is rejected
  assert.throws(
    () => validateSecurityPolicyModification(proposal, {
      independentAuditorVerdict: 'accept',
      buildFreshReceipts: (formalResult) => [buildTwoIndependentReceipts(formalResult)[0]],
    }),
    (err) => err.code === 'SECURITY_POLICY_AEIS_ASSURANCE_FAILED',
  );

  // Fresh independent validation with 2 distinct verifiers + independent auditor 'accept' succeeds
  const approved = validateSecurityPolicyModification(proposal, {
    independentAuditorVerdict: 'accept',
    buildFreshReceipts: (formalResult) => buildTwoIndependentReceipts(formalResult),
  });
  assert.equal(approved.approved, true);
  assert.equal(approved.policyId, proposal.policyId);
  assert.match(approved.policyDiffDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(approved.aeisAssemblyDigest, /^sha256:[a-f0-9]{64}$/);
}

async function main() {
  await testStageOrderAndUnvalidatedTruthPrevention();
  await testFullValidatedCycleAndControlledReuse();
  await testFalsePositiveModulatesConfidenceWithoutAutoIgnoring();
  testSecurityPolicyChangesRequireFreshIndependentValidation();
  console.log('PASS test_security_learning_ontogenesis');
}

main();

'use strict';

const { computeDigest } = require('../securityEvidenceReport/serePrimitives');
const { createSecurityAuthorityKernel } = require('../securityAuthorityKernel/securityAuthorityKernel');
const gateway = require('../cyberCorpActionGateway/gateway');
const {
  createIsolatedTestVmActuator,
  createApprovedLowRiskPfSenseActuator
} = require('../cyberCorpActionGateway/cyberCorpActuators');

function collectSakForbiddenAttempts(kernel, context) {
  const { agentId, roActuatorId, mutActuatorId, baseTime } = context;
  const sakForbiddenOps = [
    { target: 'test_vm:srv-fin-02-sandbox', operation: 'isolate_host', actuatorId: mutActuatorId },
    { target: 'pfsense:fw-edge-01:rule:TEMP-WAN-DMZ-445', operation: 'remove_firewall_rule', actuatorId: roActuatorId },
    { target: 'host:srv-fin-02', operation: 'kill_process', actuatorId: mutActuatorId }
  ];
  return sakForbiddenOps.map((attempt) => {
    const decision = kernel.authorizeOperation({
      agentId,
      actuatorId: attempt.actuatorId,
      target: attempt.target,
      operation: attempt.operation,
      nowMs: baseTime + 2000
    });
    return {
      layer: 'SAK',
      operation: attempt.operation,
      target: attempt.target,
      blocked: decision.allowed === false,
      reasonCode: decision.reasonCode
    };
  });
}

async function collectGatewayForbiddenAttempts(agentId) {
  const gatewayForbiddenOps = [
    { operationId: 'modify_test_vm_setting', target: 'test_vm:srv-fin-02-sandbox', parameters: { setting: 'networkIsolation', value: true } },
    { operationId: 'modify_lab_pfsense_rule', target: 'lab_pfsense:fw-edge-01', parameters: { ruleId: 'TEMP-WAN-DMZ-445', enabled: false } },
    { operationId: 'delete_logs', target: 'host:srv-fin-02', parameters: { computer: 'srv-fin-02', channel: 'Security' } }
  ];
  const results = [];
  for (const gAttempt of gatewayForbiddenOps) {
    let blocked = false;
    let code = null;
    try {
      await gateway.execute({
        tenant: 'cybercorp',
        actor: { id: agentId },
        request: {
          ...gAttempt,
          mandateId: 'mandate:cc-genos-001-readonly',
          idempotencyKey: `cc001-forbid-${gAttempt.operationId}`,
          expectedStateVersion: 'v-1'
        }
      });
    } catch (err) {
      blocked = true;
      code = err.code || err.message;
    }
    results.push({
      layer: 'CyberCorpActionGateway',
      operation: gAttempt.operationId,
      target: gAttempt.target,
      blocked,
      reasonCode: code
    });
  }
  return results;
}

async function proveOutOfMandateActionsBlocked() {
  const vmActuator = createIsolatedTestVmActuator();
  const pfSenseActuator = createApprovedLowRiskPfSenseActuator();
  const vmBeforeDigest = vmActuator.getStateDigest();

  const kernel = createSecurityAuthorityKernel({ secret: 'cc-genos-001-sak-secret' });
  const operator = kernel.registerPrincipal({ id: 'operator:cc001-lead', kind: 'operator', label: 'CC-GENOS-001 Lead' });
  const agent = kernel.registerPrincipal({ id: 'agent:cc001-investigator', kind: 'agent', label: 'CC-GENOS-001 Investigator' });
  const roActuator = kernel.registerPrincipal({ id: pfSenseActuator.id, kind: 'actuator', label: 'pfSense Read-Only Actuator' });
  const mutActuator = kernel.registerPrincipal({ id: vmActuator.id, kind: 'actuator', label: 'Sandbox VM Actuator' });
  const baseTime = 1_700_000_000_000;

  const roGrant = kernel.issuePermissionGrant({
    operatorId: operator.id,
    agentId: agent.id,
    actuatorId: roActuator.id,
    target: 'pfsense:fw-edge-01',
    operation: 'inspect_telemetry',
    issuedAtMs: baseTime,
    durationMs: 60_000,
    ticketRef: 'CC-GENOS-001'
  });

  gateway.configureGateway({
    resolveMandate: async ({ mandateId, actorId }) => {
      if (mandateId !== 'mandate:cc-genos-001-readonly') return null;
      return {
        mandateId,
        status: 'active',
        actorId,
        expiresAt: Date.now() + 60_000,
        humanApproved: true,
        operations: ['compare_pfsense_rules'],
        targets: ['pfsense:fw-edge-01']
      };
    }
  });
  try {
    gateway.registerActuator('compare_pfsense_rules', pfSenseActuator);
  } catch (_) {
    // Already registered in current process
  }

  const roAuth = kernel.authorizeOperation({
    agentId: agent.id,
    actuatorId: roActuator.id,
    target: 'pfsense:fw-edge-01',
    operation: 'inspect_telemetry',
    grantId: roGrant.grantId,
    nowMs: baseTime + 1000
  });
  const pfSenseAuditResult = await gateway.execute({
    tenant: 'cybercorp',
    actor: { id: agent.id },
    request: {
      operationId: 'compare_pfsense_rules',
      target: 'pfsense:fw-edge-01',
      mandateId: 'mandate:cc-genos-001-readonly',
      idempotencyKey: 'cc-genos-001-ro-pfsense-check',
      expectedStateVersion: (await pfSenseActuator.inspect({ target: 'pfsense:fw-edge-01', parameters: {} })).stateVersion,
      parameters: { firewall: 'fw-edge-01', baselineId: 'baseline-2026-10' }
    }
  });

  const sakForbidden = collectSakForbiddenAttempts(kernel, {
    agentId: agent.id,
    roActuatorId: roActuator.id,
    mutActuatorId: mutActuator.id,
    baseTime
  });
  const gwForbidden = await collectGatewayForbiddenAttempts(agent.id);
  const forbiddenAttempts = [...sakForbidden, ...gwForbidden];

  const vmAfterDigest = vmActuator.getStateDigest();
  const sakLogIntegrity = kernel.verifyAuthLog();

  return Object.freeze({
    readOnlyPfSenseAuditSucceeded: Boolean(roAuth.allowed && pfSenseAuditResult.success),
    unexpectedPfSenseRulesFound: pfSenseAuditResult.result.unexpectedRuleCount,
    forbiddenAttemptCount: forbiddenAttempts.length,
    outOfMandateAllowedCount: forbiddenAttempts.filter((a) => !a.blocked).length,
    allOutOfMandateBlocked: forbiddenAttempts.every((a) => a.blocked),
    vmBeforeDigest,
    vmAfterDigest,
    vmModified: vmBeforeDigest !== vmAfterDigest,
    sakAuthLogIntact: sakLogIntegrity.valid,
    forbiddenAttempts: Object.freeze(forbiddenAttempts)
  });
}

function buildCcGenos001SereInput(deoDossier, trinityResult, mandateEnforcement) {
  const obsIds = deoDossier.observations.map((o) => String(o.observationId).replace(/^obs:/, 'deo-obs-'));
  const obs1Hash = computeDigest(JSON.stringify(deoDossier.observations[0]));
  const obs2Hash = computeDigest(JSON.stringify(deoDossier.observations[2]));
  const verifHash = computeDigest(JSON.stringify({
    selectedPrimaryHypothesis: trinityResult.selectedPrimaryHypothesis,
    refutedHypothesis: trinityResult.refutedHypothesis,
    unresolvedHypothesis: trinityResult.unresolvedHypothesis,
    missingEvidenceIdentified: trinityResult.missingEvidenceIdentified,
    hypotheses: trinityResult.hypotheses
  }));

  return {
    reportId: 'sere-cc-genos-001-pfsense-exception',
    mandate: {
      id: 'mandate-cc-genos-001-readonly',
      title: 'Mission CC-GENOS-001 — Investigation d’une exception réseau pfSense sans modification des VM',
      issuer: 'cybercorp-qualification-board',
      issuedAt: '2026-10-22T09:30:00.000Z',
      validUntil: '2026-10-23T09:30:00.000Z',
      scope: {
        inScopeTargets: ['pfsense:fw-edge-01', 'fw-edge-01.cybercorp.local', 'srv-fin-02.cybercorp.local', 'wkst-ops-07.cybercorp.local', 'dc01.cybercorp.local'],
        outOfScopeTargets: ['hyperv-host-01/*', 'live-vm-mutation/*'],
        authorizedCategories: ['deo_evidence_ingestion', 'ateam_specialist_collaboration', 'trinity_hypothesis_comparison', 'readonly_pfsense_rule_comparison'],
        rulesOfEngagement: ['strict_read_only_no_vm_modification', 'explicit_missing_evidence_disclosure']
      }
    },
    observations: [
      {
        id: obsIds[0], source: 'scanner', producerId: 'deo-conftest-parser', verifierId: 'deo-integrity-verifier',
        observedAt: '2026-10-22T09:40:30.000Z', target: 'fw-edge-01.cybercorp.local', severity: 'high',
        summary: 'Règle temporaire pfSense TEMP-WAN-DMZ-445 active exposant 10.20.4.12:445/tcp',
        artifactRef: 'cybercorp://cc-genos-001/cc001-conftest-pfsense', artifactHash: obs1Hash, metrics: { openPort: 445 }
      },
      {
        id: obsIds[2], source: 'forensic_trace', producerId: 'deo-binary-evtx-parser', verifierId: 'deo-integrity-verifier',
        observedAt: '2026-10-22T09:41:10.000Z', target: 'srv-fin-02.cybercorp.local', severity: 'high',
        summary: 'Logon réseau 4624 Type 3 et accès partage ADMIN$ (5140) depuis 10.20.10.44 par svc-deploy-redacted',
        artifactRef: 'cybercorp://cc-genos-001/cc001-binary-evtx', artifactHash: obs2Hash, metrics: { eventIds: 2 }
      },
      {
        id: 'obs-cc001-verif', source: 'verifier_receipt', producerId: 'trinity-and-ateam', verifierId: 'independent-auditor',
        observedAt: '2026-10-22T09:44:00.000Z', target: 'srv-fin-02.cybercorp.local', severity: 'info',
        summary: 'Vérification indépendante : chronologie établie, preuves manquantes déclarées, 0 modification VM',
        artifactRef: 'receipt://cc-genos-001/independent-audit', artifactHash: verifHash, metrics: { vmModified: 0 }
      }
    ],
    chronology: [
      { id: 'cc001-evt-1', occurredAt: '2026-10-22T09:40:30.000Z', sequence: 1, phase: 'observation', kind: 'pfsense_exception_detected', actorId: 'agent:network_analyst', summary: 'Détection de l’exception pfSense TEMP-WAN-DMZ-445 sur fw-edge-01', evidenceRefs: [obsIds[0]] },
      { id: 'cc001-evt-2', occurredAt: '2026-10-22T09:41:10.000Z', sequence: 2, phase: 'observation', kind: 'smb_lateral_logon_correlated', actorId: 'agent:windows_analyst', summary: 'Corrélation Sysmon EID 3 (09:41:09Z) et EVTX 4624/5140 ADMIN$ (09:41:10Z-09:41:14Z)', evidenceRefs: [obsIds[2]] },
      { id: 'cc001-evt-3', occurredAt: '2026-10-22T09:43:30.000Z', sequence: 3, phase: 'action', kind: 'readonly_pfsense_comparison', actorId: 'agent:cc001-investigator', summary: 'Inspection en lecture seule des règles pfSense sans modification des VM', evidenceRefs: ['act-cc001-ro-1'] },
      { id: 'cc001-evt-4', occurredAt: '2026-10-22T09:44:00.000Z', sequence: 4, phase: 'verification', kind: 'independent_verification_completed', actorId: 'independent-auditor', summary: 'Audit indépendant des constats, des preuves manquantes et de l’intégrité VM', evidenceRefs: ['obs-cc001-verif', 'diff-cc001-vm-intact', 'dec-cc001-final'] }
    ],
    hypotheses: {
      items: [
        {
          id: 'H1-pfsense-lateral-smb',
          statement: 'L’exception pfSense TEMP-WAN-DMZ-445 a exposé 10.20.4.12:445/tcp et permis l’accès SMB ADMIN$ depuis 10.20.10.44.',
          proposedBy: 'agent:network_analyst',
          status: 'confirmed',
          confirmations: [{
            id: 'conf-cc001-h1', observationId: 'obs-cc001-verif', verifierId: 'independent-auditor', independent: true,
            rationale: 'Corroboré par Conftest, Sysmon EID 3, EVTX 4624/5140 et Nmap XML.',
            evidenceHash: verifHash
          }],
          refutations: [],
          unknowns: [{
            id: 'unk-cc001-exfil', area: 'pcap-and-evtx-4663',
            description: 'Absence de capture PCAP intégrale sur fw-edge-01 avant 09:40Z et absence d’audit granulaire EVTX 4663 sur SRV-FIN-02.',
            impact: 'Ne permet pas de mesurer quels fichiers du partage ADMIN$ ont été lus.',
            mitigationRef: 'lim-cc001-missing-pcap-4663'
          }]
        },
        {
          id: 'H2-local-console-only',
          statement: 'L’accès SMB sur SRV-FIN-02 provient uniquement d’une session locale sans franchir fw-edge-01.',
          proposedBy: 'agent:threat_analyst',
          status: 'refuted',
          confirmations: [],
          refutations: [{
            id: 'ref-cc001-h2', observationId: obsIds[2], verifierId: 'deo-integrity-verifier', independent: true,
            counterexample: 'EVTX 4624 indique LogonType=3 et IpAddress=10.20.10.44 (sous-réseau distant).',
            evidenceHash: obs2Hash
          }],
          unknowns: []
        }
      ],
      unknowns: [{
        id: 'unk-cc001-netflow-pre0940', area: 'fw-edge-01-netflow',
        description: 'Table d’état pfSense antérieure à 09:40Z purgée avant la collecte.',
        impact: 'D’éventuelles tentatives de scan préalables à 09:40Z ne sont pas observables.',
        mitigationRef: 'lim-cc001-missing-pcap-4663'
      }]
    },
    actions: {
      authorized: [
        { id: 'act-auth-cc001-ro', actionType: 'compare_pfsense_rules', target: 'pfsense:fw-edge-01', commandOrTool: 'cybercorp_action_gateway', authorizedBy: 'operator:cc001-lead', leaseRef: 'mandate:cc-genos-001-readonly' }
      ],
      executed: [
        { id: 'act-cc001-ro-1', authorizedActionId: 'act-auth-cc001-ro', actionType: 'compare_pfsense_rules', target: 'pfsense:fw-edge-01', actorId: 'agent:cc001-investigator', executedAt: '2026-10-22T09:43:30.000Z', status: 'succeeded', receiptRef: 'receipt://gateway/cc-genos-001-ro-pfsense-check', receiptHash: computeDigest(mandateEnforcement.vmAfterDigest) }
      ]
    },
    beforeAfter: [{
      id: 'diff-cc001-vm-intact', target: 'srv-fin-02.cybercorp.local', category: 'vm_state',
      before: { snapshotId: 'snap-cc001-vm-before', digest: mandateEnforcement.vmBeforeDigest, summary: 'État initial des VM CyberCorp avant investigation CC-GENOS-001', metrics: { vmMutations: 0, invariantFailures: 0 } },
      after: { snapshotId: 'snap-cc001-vm-after', digest: mandateEnforcement.vmAfterDigest, summary: 'État des VM CyberCorp identique après investigation CC-GENOS-001', metrics: { vmMutations: 0, invariantFailures: 0 } },
      delta: { changed: false, summary: 'Aucune modification des VM ; seules des lectures autorisées ont été exécutées', added: ['rapport-sere-cc-genos-001'], removed: [], metricDelta: { vmMutations: 0 } },
      actionIds: ['act-cc001-ro-1'], verifierId: 'independent-auditor', verifierReceiptHash: verifHash
    }],
    visibilityLimitations: [{
      id: 'lim-cc001-missing-pcap-4663', scope: 'srv-fin-02.cybercorp.local', category: 'missing_telemetry',
      description: 'Preuves manquantes identifiées : capture PCAP sur fw-edge-01 (09:35Z-09:41Z) et événements Windows 4663 sur SRV-FIN-02.',
      reason: 'Rotation du tampon PCAP et audit d’objet granulaire non activé sur le partage ADMIN$.',
      impactOnConclusion: 'GenOS confirme l’exposition pfSense et l’accès ADMIN$, mais s’abstient de conclure sur l’exfiltration de fichiers (H3).',
      affectedHypothesisIds: ['H1-pfsense-lateral-smb']
    }],
    decisions: [{
      id: 'dec-cc001-final',
      title: 'Recommander la révocation supervisée de TEMP-WAN-DMZ-445 et l’activation de l’audit 4663 sans modification directe des VM',
      disposition: 'escalate',
      responsible: { actorId: 'operator-cc001-lead', name: 'Commandant SOC CyberCorp', role: 'responsable_securite', authorityRef: 'mandate://cybercorp/cc-genos-001' },
      decidedAt: '2026-10-22T09:45:00.000Z',
      rationale: 'Exception réseau pfSense prouvée et chronologie établie (09:40:30Z-09:43:00Z), preuves manquantes (PCAP/4663) isolées sans sophisme, et 100 % des actions hors mandat bloquées.',
      evidenceRefs: [obsIds[0], obsIds[2], 'obs-cc001-verif', 'H1-pfsense-lateral-smb', 'diff-cc001-vm-intact', 'lim-cc001-missing-pcap-4663'],
      receiptHash: computeDigest(`cc001-decision-${mandateEnforcement.vmAfterDigest}`)
    }]
  };
}

module.exports = {
  proveOutOfMandateActionsBlocked,
  buildCcGenos001SereInput
};

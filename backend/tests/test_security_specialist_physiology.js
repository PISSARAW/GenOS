'use strict';

const assert = require('node:assert/strict');
const {
  SPECIALIST_ORDER,
  listSpecialistDefinitions,
  instantiateSpecialistPhysiology,
  instantiateAllSpecialists,
  assertActionAllowedForSpecialist,
  verifyDeclaredCapabilities,
  verifySpecialistOutput,
  buildSecuritySpecialistRoster,
  verifyResponsibilityBoundaries,
  runCollaborativeSecurityReview,
} = require('../src/services/securitySpecialistPhysiologyService');

function buildValidOutputs() {
  return {
    network_analyst: {
      outcome: 'success',
      claims: [
        {
          statement: 'Host 10.20.1.15 exposes SMB 445/tcp to DMZ segment via floating rule FR-104.',
          evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:pfsense-rules-01'],
        },
      ],
      specialtyAssessment: {
        niche: 'security:network_routing_ports_pfsense',
        inScope: true,
        evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:pfsense-rules-01'],
      },
      networkFindings: {
        exposedPorts: [{ host: '10.20.1.15', port: 445, protocol: 'tcp', service: 'microsoft-ds' }],
        routingAnomalies: [{ route: '10.20.0.0/16 -> 10.10.0.0/16', issue: 'asymmetric_gateway_bypass' }],
        pfsenseRulesChecked: ['FR-104', 'WAN-BLOCK-01', 'DMZ-ISOLATE-03'],
      },
    },
    windows_analyst: {
      outcome: 'success',
      claims: [
        {
          statement: 'GPO Default Domain Policy permits NTLMv1 and svc_backup holds unintended SeDebugPrivilege.',
          evidence: ['deo:obs:evtx-4624-01', 'deo:obs:gpo-report-01'],
        },
      ],
      specialtyAssessment: {
        niche: 'security:windows_ad_gpo_acl_evtx',
        inScope: true,
        evidence: ['deo:obs:evtx-4624-01', 'deo:obs:gpo-report-01'],
      },
      windowsFindings: {
        adPrincipals: ['CORP\\svc_backup', 'CORP\\Domain Admins'],
        gpoPostureFindings: ['GPO-001: LmCompatibilityLevel=1 allows NTLMv1'],
        aclViolations: ['OU=Servers: GenericAll granted to CORP\\svc_backup'],
        evtxEventIds: [4624, 4672, 4688],
      },
    },
    forensic_analyst: {
      outcome: 'success',
      claims: [
        {
          statement: 'SMB connection from 10.20.1.99 precedes logon 4624 on DC01 by 800ms with intact chain of custody.',
          evidence: ['deo:obs:evtx-4624-01', 'deo:obs:hayabusa-01', 'deo:cluster:host:dc01'],
        },
      ],
      workerArtifact: {
        type: 'causal_dossier',
        content: {
          causalChain: [
            {
              from: 'deo:obs:nmap-dmz-01',
              to: 'deo:obs:evtx-4624-01',
              relation: 'exposed_smb_enables_network_logon',
              evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01'],
            },
          ],
          evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:obs:hayabusa-01'],
        },
        provenance: {
          sourceRefs: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:obs:hayabusa-01'],
        },
      },
      forensicFindings: {
        timelineEvents: [
          { timestamp: '2026-04-20T07:10:00.000Z', obsId: 'deo:obs:nmap-dmz-01' },
          { timestamp: '2026-04-20T07:10:00.800Z', obsId: 'deo:obs:evtx-4624-01' },
        ],
        integrityVerified: true,
        correlationClusterIds: ['deo:cluster:host:dc01.corp.local', 'deo:cluster:user:svc_backup'],
      },
    },
    threat_analyst: {
      outcome: 'success',
      claims: [
        {
          statement: 'Incident qualifies as HIGH severity NTLM relay / SMB lateral movement (T1021.002).',
          evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:obs:gpo-report-01'],
        },
      ],
      workerArtifact: {
        type: 'verification_report',
        content: {
          testedClaim: 'DMZ segment is isolated from Domain Controller authentication surface.',
          verificationMethod: 'adversarial_hypothesis_falsification',
          verdict: 'reject',
          reproductionSteps: [
            'Inspect pfSense floating rule FR-104 permitting 445/tcp from DMZ',
            'Correlate EVTX 4624 Type 3 logon on DC01 with NTLMv1 GPO posture',
          ],
          evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:obs:gpo-report-01'],
          counterexamples: [
            {
              claim: 'DMZ cannot reach DC01 SMB',
              attack: 'NTLM relay over 445/tcp via FR-104',
              reproductionSteps: ['Check FR-104 rule match', 'Verify EVTX 4624 source IP 10.20.1.99'],
              evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01'],
            },
          ],
        },
        provenance: {
          sourceRefs: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:obs:gpo-report-01'],
        },
      },
      threatQualification: {
        hypotheses: [
          { id: 'H1', status: 'falsified', description: 'Password spray over WAN' },
          { id: 'H2', status: 'corroborated', description: 'DMZ-to-DC SMB lateral movement via svc_backup' },
        ],
        severityQualification: 'HIGH',
        falsificationTests: ['Checked WAN auth logs for spray pattern', 'Verified SMB signing disabled on target'],
      },
    },
    remediation_planner: {
      outcome: 'success',
      claims: [
        {
          statement: 'Sequencing NTLMv2 GPO enforcement before FR-104 restriction blocks lateral movement safely.',
          evidence: ['deo:obs:pfsense-rules-01', 'deo:obs:gpo-report-01'],
        },
      ],
      specialtyAssessment: {
        niche: 'security:remediation_dependencies_consequences',
        inScope: true,
        evidence: ['deo:obs:pfsense-rules-01', 'deo:obs:gpo-report-01'],
      },
      remediationPlan: {
        proposedActions: [
          { id: 'ACT-1', target: 'AD GPO', action: 'Enforce LmCompatibilityLevel=5 (NTLMv2 only) and SMB signing' },
          { id: 'ACT-2', target: 'pfSense FR-104', action: 'Restrict 445/tcp from DMZ to explicit jump host only' },
          { id: 'ACT-3', target: 'AD ACL', action: 'Revoke GenericAll and SeDebugPrivilege from CORP\\svc_backup' },
        ],
        dependencies: [
          { actionId: 'ACT-1', dependsOn: 'Verify backup agent supports NTLMv2/Kerberos before GPO push' },
          { actionId: 'ACT-2', dependsOn: 'ACT-1' },
        ],
        consequences: [
          { actionId: 'ACT-1', impact: 'Legacy NTLMv1 clients will fail authentication' },
          { actionId: 'ACT-2', impact: 'Direct SMB mounts from DMZ web nodes will terminate immediately' },
        ],
        rollbackStrategy: 'Restore pfSense config snapshot rev-88 and revert GPO link state to previous version.',
      },
    },
    independent_auditor: {
      outcome: 'unresolved',
      claims: [
        {
          statement: 'All 5 upstream dossiers satisfy schema and evidence links, but NTP skew contradiction on WORKSTATION-07 remains unresolved.',
          evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:conflict:timestamp-skew-ws07'],
        },
      ],
      workerArtifact: {
        type: 'verification_report',
        content: {
          testedClaim: 'Complete multi-specialist incident dossier is free of unresolved evidentiary contradictions.',
          verificationMethod: 'independent_cross_dossier_contradiction_audit',
          verdict: 'unresolved',
          reproductionSteps: [
            'Compare Forensic Analyst timeline against raw EVTX header and Hayabusa export on WORKSTATION-07',
            'Verify Remediation Planner dependencies against Windows and Network findings',
          ],
          evidence: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:conflict:timestamp-skew-ws07'],
        },
        provenance: {
          sourceRefs: ['deo:obs:nmap-dmz-01', 'deo:obs:evtx-4624-01', 'deo:conflict:timestamp-skew-ws07'],
        },
      },
      auditReport: {
        independentVerdict: 'unresolved',
        preservedContradictions: [
          {
            contradictionId: 'deo:conflict:timestamp-skew-ws07',
            nature: 'TIMESTAMP_CONTRADICTION',
            reason: 'Conflicting clock sources between EVTX header and Hayabusa export on WORKSTATION-07.',
          },
        ],
        auditedSpecialists: [
          'network_analyst',
          'windows_analyst',
          'forensic_analyst',
          'threat_analyst',
          'remediation_planner',
        ],
        promotionEligible: false,
      },
    },
  };
}

function testMandatesPermissionsAndCapabilities() {
  const definitions = listSpecialistDefinitions();
  assert.equal(definitions.length, 6, 'Must define exactly 6 security specialists');
  assert.deepEqual(definitions.map((d) => d.specialistId), [...SPECIALIST_ORDER]);

  const instances = instantiateAllSpecialists();
  assert.equal(instances.length, 6);

  for (const inst of instances) {
    assert.ok(inst.mandate && inst.mandate.length > 15, `Mandate missing for ${inst.specialistId}`);
    assert.equal(inst.minimalPermissions.read, true);
    assert.equal(inst.minimalPermissions.write, false, `${inst.specialistId} must not have write permission`);
    assert.equal(inst.minimalPermissions.promote, false, `${inst.specialistId} must not have promote permission`);
    assert.equal(inst.minimalPermissions.spawn, false, `${inst.specialistId} must not have spawn permission`);
    assert.equal(inst.minimalPermissions.delegate, false, `${inst.specialistId} must not have delegate permission`);
    assert.equal(inst.minimalPermissions.topology, false, `${inst.specialistId} must not have topology permission`);

    assert.ok(!inst.effectiveToolLease.includes('genos_apply_patch'));
    assert.ok(!inst.effectiveToolLease.includes('genos_promote_branch'));
    assert.ok(!inst.effectiveToolLease.includes('genos_spawn_agent'));

    assert.ok(inst.verifiedCapabilities.length > 0);
    assert.ok(inst.verifiedCapabilities.every((c) => c.actuallyAccessible === true));
  }

  const threat = instantiateSpecialistPhysiology('threat_analyst');
  assert.ok(threat.effectiveToolLease.includes('genos_execute_strategy_pipeline'));
  const auditor = instantiateSpecialistPhysiology('independent_auditor');
  assert.ok(auditor.effectiveToolLease.includes('genos_replay'));

  assert.throws(
    () => verifyDeclaredCapabilities('network_analyst', ['dream_consolidation'], threat.effectiveToolLease),
    (err) => err.code === 'SPECIALIST_CAPABILITY_NOT_ACCESSIBLE',
  );

  assert.throws(
    () => assertActionAllowedForSpecialist('network_analyst', { action: 'modify_firewall_rules' }),
    (err) => err.code === 'SPECIALIST_FORBIDDEN_ACTION',
  );
  assert.throws(
    () => assertActionAllowedForSpecialist('windows_analyst', { action: 'edit', toolName: 'genos_apply_patch' }),
    (err) => err.code === 'SPECIALIST_TOOL_NOT_IN_MINIMAL_LEASE',
  );
  assert.throws(
    () => assertActionAllowedForSpecialist('network_analyst', { action: 'inspect', toolName: 'genos_change_strategy' }),
    (err) => err.code === 'SPECIALIST_TOOL_NOT_IN_MINIMAL_LEASE',
  );
  const allowed = assertActionAllowedForSpecialist('network_analyst', {
    action: 'inspect_pfsense_rules',
    toolName: 'genos_diagnose',
  });
  assert.equal(allowed.allowed, true);
}

function testVerifiableOutputContracts() {
  const validOutputs = buildValidOutputs();
  for (const id of SPECIALIST_ORDER) {
    const receipt = verifySpecialistOutput(id, validOutputs[id]);
    assert.equal(receipt.verified, true);
    assert.equal(receipt.specialistId, id);
    assert.equal(receipt.promotionEligible, false);
    assert.match(receipt.outputDigest, /^sha256:[a-f0-9]{64}$/);
  }

  const brokenNetwork = { ...validOutputs.network_analyst, networkFindings: { exposedPorts: [] } };
  assert.throws(
    () => verifySpecialistOutput('network_analyst', brokenNetwork),
    (err) => err.code === 'SPECIALIST_OUTPUT_DOMAIN_INVALID',
  );

  const brokenThreat = {
    ...validOutputs.threat_analyst,
    workerArtifact: {
      ...validOutputs.threat_analyst.workerArtifact,
      content: { ...validOutputs.threat_analyst.workerArtifact.content, counterexamples: [] },
    },
  };
  assert.throws(
    () => verifySpecialistOutput('threat_analyst', brokenThreat),
    (err) => err.code === 'INVALID_WORKER_ARTIFACT',
  );

  assert.throws(
    () => verifySpecialistOutput('remediation_planner', { ...validOutputs.remediation_planner, promotionEligible: true }),
    (err) => err.code === 'SPECIALIST_SELF_PROMOTION_FORBIDDEN',
  );
}

function testCollaborationAndATeamWiring() {
  const roster = buildSecuritySpecialistRoster();
  assert.equal(roster.members.length, 6);
  assert.equal(roster.workGraph.layers.length, 4);
  assert.deepEqual(roster.workGraph.memberStages, {
    network_analyst: 0,
    windows_analyst: 0,
    forensic_analyst: 0,
    threat_analyst: 1,
    remediation_planner: 2,
    independent_auditor: 3,
  });

  verifyResponsibilityBoundaries(roster.members);

  const validOutputs = buildValidOutputs();
  const review = runCollaborativeSecurityReview(validOutputs);
  assert.equal(review.schema, 'genos.security-specialist-collaboration/v1');
  assert.equal(review.handoffCount, 12);
  assert.equal(review.independentAuditVerdict, 'unresolved');
  assert.equal(review.contradictionCount, 1);
  assert.equal(review.promotionEligible, false);
  assert.equal(review.authorizesPromotion, false);
  assert.match(review.collaborationDigest, /^sha256:[a-f0-9]{64}$/);
}

function main() {
  testMandatesPermissionsAndCapabilities();
  testVerifiableOutputContracts();
  testCollaborationAndATeamWiring();
  console.log('PASS test_security_specialist_physiology');
}

main();

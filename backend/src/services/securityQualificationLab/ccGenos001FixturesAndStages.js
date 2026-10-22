'use strict';

const deo = require('../digitalEvidenceOrgan');
const sm = require('../morphogenesis/securityMorphogenesis');
const physiology = require('../securitySpecialistPhysiology');
const { computeDigest } = require('../securityEvidenceReport/serePrimitives');

const CC001_COLLECTOR_ID = 'sensor:cybercorp-pfsense-dfir-01';
const CC001_TRUST_SECRET = 'cc-genos-001-deo-collector-secret-2026';
const CC001_TRUST_POLICY = Object.freeze({
  trustedCollectors: [CC001_COLLECTOR_ID],
  collectorSecrets: { [CC001_COLLECTOR_ID]: CC001_TRUST_SECRET }
});

function signCc001Artifact(artifactId, rawContent, collectedAt) {
  const rawHash = deo.sha256Digest(rawContent);
  return {
    collectorId: CC001_COLLECTOR_ID,
    sourceUri: `cybercorp://cc-genos-001/${artifactId}`,
    collectedAt,
    signature: deo.computeSourceSignature({ artifactId, rawHash, collectorId: CC001_COLLECTOR_ID }, CC001_TRUST_SECRET)
  };
}

function buildCcGenos001DeoArtifacts() {
  const binaryEvtx = deo.buildBinaryEvtxBuffer([
    {
      recordId: 50101,
      eventId: 4624,
      timestamp: '2026-10-22T09:41:10Z',
      host: 'SRV-FIN-02.cybercorp.local',
      channel: 'Security',
      data: { TargetUserName: 'svc-deploy-redacted', IpAddress: '10.20.10.44', LogonType: '3' }
    },
    {
      recordId: 50102,
      eventId: 5140,
      timestamp: '2026-10-22T09:41:14Z',
      host: 'SRV-FIN-02.cybercorp.local',
      channel: 'Security',
      data: { SubjectUserName: 'svc-deploy-redacted', ShareName: '\\\\*\\ADMIN$', IpAddress: '10.20.10.44' }
    }
  ]);

  const nmapXml = `<nmaprun scanner="nmap" args="nmap -sT -p 22,80,443,445,3389 10.20.4.12" start="1792662180" version="7.94">
  <host starttime="1792662180">
    <status state="up" reason="arp-response"/>
    <address addr="10.20.4.12" addrtype="ipv4"/>
    <hostnames><hostname name="SRV-FIN-02.cybercorp.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="filtered" reason="no-response"/><service name="ssh"/></port>
      <port protocol="tcp" portid="80"><state state="closed" reason="reset"/><service name="http"/></port>
      <port protocol="tcp" portid="443"><state state="open" reason="syn-ack"/><service name="https"/></port>
      <port protocol="tcp" portid="445"><state state="open" reason="syn-ack"/><service name="microsoft-ds"/></port>
      <port protocol="tcp" portid="3389"><state state="filtered" reason="no-response"/><service name="ms-wbt-server"/></port>
    </ports>
  </host>
</nmaprun>`;

  const hayabusaCsv = [
    'Timestamp,Computer,Channel,EventID,Level,RuleTitle,User,Process,Details',
    '2026-10-22T09:41:09Z,WKST-OPS-07.cybercorp.local,Sysmon,3,high,"Outbound SMB via Temporary pfSense Exception",svc-deploy-redacted,C:\\Windows\\System32\\rundll32.exe,"SrcIp=10.20.10.44 DstIp=10.20.4.12 DstPort=445 Rule=TEMP-WAN-DMZ-445"'
  ].join('\n');

  const gpoZaurrJson = JSON.stringify({
    GPOName: 'CyberCorp-Tier0-DC-Hardening',
    DomainName: 'cybercorp.local',
    GeneratedAt: '2026-10-22T09:42:00Z',
    DeclaredSettingCount: 2,
    GPOSettings: [
      {
        Computer: 'SRV-FIN-02.cybercorp.local',
        PolicyPath: 'Computer/SecuritySettings/LocalPolicies/UserRightsAssignment',
        SettingName: 'AccessFromNetwork',
        State: 'Enabled',
        Principal: 'svc-deploy-redacted'
      },
      {
        Computer: 'DC01.cybercorp.local',
        PolicyPath: 'Computer/SecuritySettings/LocalPolicies/SecurityOptions',
        SettingName: 'MicrosoftNetworkServerDigitallySignCommunicationsAlways',
        State: 'Enabled',
        Principal: 'SYSTEM'
      }
    ]
  });

  const conftestPfsenseJson = JSON.stringify([
    {
      filename: 'policy/pfsense-fw-edge-01-rules.json',
      namespace: 'cybercorp.firewall.pfsense',
      host: 'fw-edge-01.cybercorp.local',
      user: 'secops-audit',
      process: 'conftest',
      timestamp: '2026-10-22T09:40:30Z',
      successes: 5,
      failures: [
        {
          msg: 'Rule TEMP-WAN-DMZ-445 exposes 10.20.4.12:445/tcp without active change window',
          rule: 'no_unapproved_pfsense_smb_445_exception'
        }
      ],
      warnings: []
    }
  ]);

  return [
    { artifactId: 'cc001-conftest-pfsense', format: 'conftest', rawContent: conftestPfsenseJson, sourceMetadata: signCc001Artifact('cc001-conftest-pfsense', conftestPfsenseJson, '2026-10-22T09:40:30Z') },
    { artifactId: 'cc001-hayabusa-sysmon', format: 'hayabusa_csv', rawContent: hayabusaCsv, sourceMetadata: signCc001Artifact('cc001-hayabusa-sysmon', hayabusaCsv, '2026-10-22T09:41:09Z') },
    { artifactId: 'cc001-binary-evtx', format: 'evtx', rawContent: binaryEvtx, sourceMetadata: signCc001Artifact('cc001-binary-evtx', binaryEvtx, '2026-10-22T09:41:15Z') },
    { artifactId: 'cc001-gpozaurr-ad', format: 'gpo_report', rawContent: gpoZaurrJson, sourceMetadata: signCc001Artifact('cc001-gpozaurr-ad', gpoZaurrJson, '2026-10-22T09:42:00Z') },
    { artifactId: 'cc001-nmap-xml', format: 'nmap_xml', rawContent: nmapXml, sourceMetadata: signCc001Artifact('cc001-nmap-xml', nmapXml, '2026-10-22T09:43:00Z') }
  ];
}

function buildCcGenos001SpecialistOutputs(deoDossier) {
  const obsIds = deoDossier.observations.map((o) => o.observationId);
  const [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, gpoObs, nmapObs] = [
    obsIds[0], obsIds[1], obsIds[2], obsIds[3], obsIds[4], obsIds[obsIds.length - 1]
  ];
  return {
    network_analyst: {
      outcome: 'success',
      claims: [{
        statement: 'pfSense rule TEMP-WAN-DMZ-445 on fw-edge-01 exposes 10.20.4.12:445/tcp as confirmed by Conftest and Nmap.',
        evidence: [conftestObs, nmapObs]
      }],
      specialtyAssessment: {
        niche: 'security:network_routing_ports_pfsense',
        inScope: true,
        evidence: [conftestObs, nmapObs]
      },
      networkFindings: {
        exposedPorts: [{ host: '10.20.4.12', port: 445, protocol: 'tcp', service: 'microsoft-ds' }],
        routingAnomalies: [{ route: '10.20.10.44 -> 10.20.4.12:445', issue: 'pfsense_temp_rule_TEMP-WAN-DMZ-445_expired_window' }],
        pfsenseRulesChecked: ['TEMP-WAN-DMZ-445', 'WAN-BLOCK-DEFAULT', 'DMZ-HTTPS-443']
      }
    },
    windows_analyst: {
      outcome: 'success',
      claims: [{
        statement: 'SRV-FIN-02 recorded Type 3 network logon 4624 and ADMIN$ share access 5140 by svc-deploy-redacted from 10.20.10.44.',
        evidence: [evtx4624Obs, evtx5140Obs, gpoObs]
      }],
      specialtyAssessment: {
        niche: 'security:windows_ad_gpo_acl_evtx',
        inScope: true,
        evidence: [evtx4624Obs, evtx5140Obs, gpoObs]
      },
      windowsFindings: {
        adPrincipals: ['CORP\\svc-deploy-redacted'],
        gpoPostureFindings: ['CyberCorp-Tier0-DC-Hardening: AccessFromNetwork enabled for svc-deploy-redacted on SRV-FIN-02'],
        aclViolations: ['Administrative share \\\\*\\ADMIN$ accessed from workstation subnet 10.20.10.44'],
        evtxEventIds: [4624, 5140]
      }
    },
    forensic_analyst: {
      outcome: 'success',
      claims: [{
        statement: 'Chronology established across 5 sources from 09:40:30Z to 09:43:00Z; PCAP before 09:40Z and EVTX 4663 object audit are missing.',
        evidence: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, nmapObs]
      }],
      workerArtifact: {
        type: 'causal_dossier',
        content: {
          causalChain: [
            { from: conftestObs, to: hayaObs, relation: 'pfsense_exception_permitted_outbound_smb', evidence: [conftestObs, hayaObs] },
            { from: hayaObs, to: evtx5140Obs, relation: 'smb_connection_authenticated_and_mounted_admin_share', evidence: [hayaObs, evtx4624Obs, evtx5140Obs] }
          ],
          evidence: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, nmapObs]
        },
        provenance: { sourceRefs: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, nmapObs] }
      },
      forensicFindings: {
        timelineEvents: [
          { timestamp: '2026-10-22T09:40:30.000Z', obsId: conftestObs },
          { timestamp: '2026-10-22T09:41:09.000Z', obsId: hayaObs },
          { timestamp: '2026-10-22T09:41:10.000Z', obsId: evtx4624Obs },
          { timestamp: '2026-10-22T09:41:14.000Z', obsId: evtx5140Obs },
          { timestamp: '2026-10-22T09:43:00.000Z', obsId: nmapObs }
        ],
        integrityVerified: true,
        correlationClusterIds: ['deo:cluster:host:srv-fin-02.cybercorp.local', 'deo:cluster:user:svc-deploy-redacted']
      }
    },
    threat_analyst: {
      outcome: 'success',
      claims: [{
        statement: 'Trinity hypothesis H1 (lateral SMB via pfSense exception) corroborated; H2 (local hypervisor bypass) refuted; H3 (data exfiltration volume) unresolved due to missing PCAP/4663.',
        evidence: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, nmapObs]
      }],
      workerArtifact: {
        type: 'verification_report',
        content: {
          testedClaim: 'H2: SMB access on SRV-FIN-02 originated locally without traversing pfSense rule TEMP-WAN-DMZ-445.',
          verificationMethod: 'trinity_three_hypothesis_adversarial_falsification',
          verdict: 'reject',
          reproductionSteps: [
            'Compare Sysmon EID 3 SrcIp 10.20.10.44 -> DstIp 10.20.4.12:445',
            'Verify EVTX 4624 LogonType=3 and IpAddress=10.20.10.44 on SRV-FIN-02'
          ],
          evidence: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs],
          counterexamples: [{
            claim: 'Local-only access without firewall traversal',
            attack: 'Cross-subnet SMB connection from 10.20.10.44 matching TEMP-WAN-DMZ-445',
            reproductionSteps: ['Inspect Hayabusa EID 3', 'Inspect EVTX 4624/5140'],
            evidence: [hayaObs, evtx4624Obs]
          }]
        },
        provenance: { sourceRefs: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs] }
      },
      threatQualification: {
        hypotheses: [
          { id: 'H1', status: 'corroborated', description: 'Lateral SMB access enabled by unrevoked pfSense exception TEMP-WAN-DMZ-445' },
          { id: 'H2', status: 'falsified', description: 'Local console or internal hypervisor maintenance without firewall traversal' },
          { id: 'H3', status: 'unresolved', description: 'Sensitive file exfiltration over ADMIN$ (missing PCAP payload and EVTX 4663)' }
        ],
        severityQualification: 'HIGH',
        falsificationTests: [
          'Falsified H2 via LogonType=3 and cross-subnet source IP 10.20.10.44',
          'Suspended H3 due to missing PCAP and missing object-level EVTX 4663'
        ]
      }
    },
    remediation_planner: {
      outcome: 'success',
      claims: [{
        statement: 'Recommend operator-approved removal of pfSense rule TEMP-WAN-DMZ-445 and rotation of svc-deploy-redacted; zero live VM modification performed during CC-GENOS-001.',
        evidence: [conftestObs, gpoObs, nmapObs]
      }],
      specialtyAssessment: {
        niche: 'security:remediation_dependencies_consequences',
        inScope: true,
        evidence: [conftestObs, gpoObs, nmapObs]
      },
      remediationPlan: {
        proposedActions: [
          { id: 'ACT-1', target: 'pfsense:fw-edge-01:rule:TEMP-WAN-DMZ-445', action: 'Submit operator approval request to disable rule TEMP-WAN-DMZ-445' },
          { id: 'ACT-2', target: 'ad:svc-deploy-redacted', action: 'Restrict AccessFromNetwork GPO right on SRV-FIN-02' }
        ],
        dependencies: [
          { actionId: 'ACT-1', dependsOn: 'Human operator approval required under CC-GENOS-001 read-only mandate' },
          { actionId: 'ACT-2', dependsOn: 'ACT-1' }
        ],
        consequences: [
          { actionId: 'ACT-1', impact: 'Closes 10.20.4.12:445/tcp from ops subnet' },
          { actionId: 'ACT-2', impact: 'Prevents svc-deploy-redacted from mounting ADMIN$ over SMB' }
        ],
        rollbackStrategy: 'Restore pfSense configuration snapshot and GPO version from verified backup.'
      }
    },
    independent_auditor: {
      outcome: 'success',
      claims: [{
        statement: 'All claims verified against DEO hashes; missing PCAP/4663 evidence explicitly documented without overclaim; zero VM modification confirmed.',
        evidence: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, gpoObs, nmapObs]
      }],
      workerArtifact: {
        type: 'verification_report',
        content: {
          testedClaim: 'Mission CC-GENOS-001 chronology, missing evidence disclosure, and read-only VM invariant are satisfied.',
          verificationMethod: 'independent_cross_dossier_contradiction_audit',
          verdict: 'accept',
          reproductionSteps: [
            'Verify all 5 DEO artifacts and 7 normalized observations',
            'Verify H3 unknown is preserved as missing evidence without claiming absence of exfiltration'
          ],
          evidence: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, gpoObs, nmapObs]
        },
        provenance: { sourceRefs: [conftestObs, hayaObs, evtx4624Obs, evtx5140Obs, gpoObs, nmapObs] }
      },
      auditReport: {
        independentVerdict: 'accept',
        preservedContradictions: [],
        auditedSpecialists: ['network_analyst', 'windows_analyst', 'forensic_analyst', 'threat_analyst', 'remediation_planner'],
        promotionEligible: false
      }
    }
  };
}

function runTrinityHypothesisArbitration(deoDossier) {
  const trinityMatch = sm.matchTopologyToMission('comparer_trois_hypotheses_incident');
  const trinityTopologyRun = sm.runTopology(trinityMatch.topology, 3, sm.CORPUS);
  const obsIds = deoDossier.observations.map((o) => o.observationId);
  const hypotheses = Object.freeze([
    Object.freeze({
      id: 'H1_pfsense_exception_lateral_smb',
      title: 'Accès latéral SMB rendu possible par l’exception pfSense TEMP-WAN-DMZ-445',
      status: 'confirmed',
      supportingEvidence: [obsIds[0], obsIds[1], obsIds[2], obsIds[3], obsIds[obsIds.length - 1]],
      rationale: 'Conftest, Sysmon EID 3, EVTX 4624/5140 et Nmap 445/tcp convergent sur la règle TEMP-WAN-DMZ-445.'
    }),
    Object.freeze({
      id: 'H2_local_console_or_hypervisor_maintenance',
      title: 'Opération locale sur console ou hyperviseur sans traversée du pare-feu pfSense',
      status: 'refuted',
      refutingEvidence: [obsIds[1], obsIds[2]],
      rationale: 'Réfutée par LogonType=3, IpAddress=10.20.10.44 et la connexion réseau Sysmon EID 3 via rundll32.exe.'
    }),
    Object.freeze({
      id: 'H3_exfiltration_over_admin_share',
      title: 'Exfiltration de fichiers sensibles depuis SRV-FIN-02 via le partage ADMIN$',
      status: 'indeterminate_missing_evidence',
      missingEvidence: [
        'pcap_full_payload_capture_fw_edge_01_0935_0941Z',
        'windows_security_evtx_4663_object_access_audit_srv_fin_02'
      ],
      rationale: 'Le montage ADMIN$ (5140) est prouvé, mais en l’absence de PCAP et d’audit 4663, GenOS s’abstient de conclure sur le volume ou les fichiers lus.'
    })
  ]);
  return Object.freeze({
    topology: trinityMatch.topology,
    usage: trinityMatch.usage,
    topologyRunOk: trinityTopologyRun.combined.ok,
    measuredBudget: trinityTopologyRun.measuredBudget,
    selectedPrimaryHypothesis: 'H1_pfsense_exception_lateral_smb',
    refutedHypothesis: 'H2_local_console_or_hypervisor_maintenance',
    unresolvedHypothesis: 'H3_exfiltration_over_admin_share',
    missingEvidenceIdentified: hypotheses[2].missingEvidence,
    hypotheses
  });
}

module.exports = {
  CC001_TRUST_POLICY,
  buildCcGenos001DeoArtifacts,
  buildCcGenos001SpecialistOutputs,
  runTrinityHypothesisArbitration
};

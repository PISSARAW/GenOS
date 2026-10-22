'use strict';

const deo = require('../digitalEvidenceOrgan');
const { runProcedure } = require('../agents/deterministicWorkerProcedures');
const evidence = require('./securityMorphogenesisEvidence');

const REDACTED_COLLECTOR = 'sensor:cybercorp-dfir-collector';
const REDACTED_SECRET = 'cybercorp-morphogenesis-deo-secret-2026';
const REDACTED_TRUST_POLICY = Object.freeze({
  trustedCollectors: [REDACTED_COLLECTOR],
  collectorSecrets: { [REDACTED_COLLECTOR]: REDACTED_SECRET },
});

function signArtifact(artifactId, rawContent) {
  const rawHash = deo.sha256Digest(rawContent);
  return {
    collectorId: REDACTED_COLLECTOR,
    sourceUri: `cybercorp://redacted-vault/${artifactId}`,
    collectedAt: '2026-10-22T10:05:00Z',
    signature: deo.computeSourceSignature({ artifactId, rawHash, collectorId: REDACTED_COLLECTOR }, REDACTED_SECRET),
  };
}

const WIN_EVTX_BINARY = deo.buildBinaryEvtxBuffer([
  {
    recordId: 41001,
    eventId: 4624,
    timestamp: '2026-10-22T09:41:10Z',
    host: 'SRV-FIN-02.cybercorp.local',
    channel: 'Security',
    data: { TargetUserName: 'svc-deploy-redacted', IpAddress: '10.20.10.44', LogonType: '3' },
  },
  {
    recordId: 41002,
    eventId: 5140,
    timestamp: '2026-10-22T09:41:14Z',
    host: 'SRV-FIN-02.cybercorp.local',
    channel: 'Security',
    data: { SubjectUserName: 'svc-deploy-redacted', ShareName: '\\\\*\\ADMIN$', IpAddress: '10.20.10.44' },
  },
]);

const AD_GPOZAURR_JSON = JSON.stringify({
  GPOName: 'CyberCorp-Tier0-DC-Hardening',
  DomainName: 'cybercorp.local',
  GeneratedAt: '2026-10-22T09:42:00Z',
  DeclaredSettingCount: 2,
  GPOSettings: [
    {
      Computer: 'DC01.cybercorp.local',
      PolicyPath: 'Computer/SecuritySettings/UserRightsAssignment',
      SettingName: 'SeDebugPrivilege',
      State: 'Disabled',
      Principal: 'svc-deploy-redacted',
    },
    {
      Computer: 'DC01.cybercorp.local',
      PolicyPath: 'Computer/SecuritySettings/SecurityOptions',
      SettingName: 'SMBServerRequireSecuritySignature',
      State: 'Enabled',
      Principal: 'SYSTEM',
    },
  ],
});

const PFSENSE_NMAP_XML = `<nmaprun scanner="nmap" args="nmap -sT -p 22,443,445 10.20.4.12" start="1792662180" version="7.94">
  <host starttime="1792662180">
    <status state="up" reason="arp-response"/>
    <address addr="10.20.4.12" addrtype="ipv4"/>
    <hostnames><hostname name="SRV-FIN-02.cybercorp.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="filtered" reason="no-response"/><service name="ssh"/></port>
      <port protocol="tcp" portid="443"><state state="open" reason="syn-ack"/><service name="https"/></port>
      <port protocol="tcp" portid="445"><state state="open" reason="syn-ack"/><service name="microsoft-ds"/></port>
    </ports>
  </host>
</nmaprun>`;

const SYSMON_EVTX_BINARY = deo.buildBinaryEvtxBuffer([
  {
    recordId: 88011,
    eventId: 1,
    timestamp: '2026-10-22T09:41:08Z',
    host: 'WKST-OPS-07.cybercorp.local',
    channel: 'Microsoft-Windows-Sysmon/Operational',
    data: { User: 'svc-deploy-redacted', Image: 'C:\\Windows\\System32\\rundll32.exe' },
  },
  {
    recordId: 88012,
    eventId: 3,
    timestamp: '2026-10-22T09:41:09Z',
    host: 'WKST-OPS-07.cybercorp.local',
    channel: 'Microsoft-Windows-Sysmon/Operational',
    data: { User: 'svc-deploy-redacted', Image: 'C:\\Windows\\System32\\rundll32.exe', DestinationIp: '10.20.4.12', DestinationPort: '445' },
  },
]);

const SYSMON_HAYABUSA_CSV = [
  'Timestamp,Computer,Channel,EventID,Level,RuleTitle,User,Process,Details',
  '2026-10-22T09:41:09Z,WKST-OPS-07.cybercorp.local,Sysmon,3,high,"Suspicious Outbound SMB via Rundll32",svc-deploy-redacted,C:\\Windows\\System32\\rundll32.exe,"DestIp=10.20.4.12 DestPort=445 Rule=TEMP-WAN-DMZ-445"',
].join('\n');

const CYBERCORP_MISSION_CORPUS = Object.freeze([
  Object.freeze({
    missionId: 'cc-mission-windows-evtx-smb',
    domain: 'windows',
    title: 'Windows Security EVTX — Logon Type 3 et accès partage ADMIN$ sur SRV-FIN-02',
    host: 'srv-fin-02.cybercorp.local',
    artifacts: [
      { artifactId: 'cc-win-evtx-01', format: 'evtx', rawContent: WIN_EVTX_BINARY, sourceMetadata: signArtifact('cc-win-evtx-01', WIN_EVTX_BINARY) },
    ],
    specialistTasks: [
      { id: 'windows_evtx_parse', duration: 18 },
      { id: 'smb_share_correlation', duration: 12 },
    ],
    expected: {
      domain: 'windows',
      expectedHost: 'srv-fin-02.cybercorp.local',
      expectedFinding: 'lateral_smb_admin_share_access',
      minObservations: 2,
    },
  }),
  Object.freeze({
    missionId: 'cc-mission-ad-gpozaurr-tier0',
    domain: 'active_directory',
    title: 'Active Directory GPOZaurr — Audit de délégation Tier-0 et signature SMB sur DC01',
    host: 'dc01.cybercorp.local',
    artifacts: [
      { artifactId: 'cc-ad-gpo-01', format: 'gpo_report', rawContent: AD_GPOZAURR_JSON, sourceMetadata: signArtifact('cc-ad-gpo-01', AD_GPOZAURR_JSON) },
    ],
    specialistTasks: [
      { id: 'ad_gpozaurr_audit', duration: 15 },
      { id: 'tier0_privilege_check', duration: 10 },
    ],
    expected: {
      domain: 'active_directory',
      expectedHost: 'dc01.cybercorp.local',
      expectedFinding: 'gpo_tier0_se_debug_disabled_anomaly',
      minObservations: 2,
    },
  }),
  Object.freeze({
    missionId: 'cc-mission-pfsense-exception-445',
    domain: 'pfsense',
    title: 'pfSense & Nmap — Investigation de l’exception réseau TEMP-WAN-DMZ-445 vers 10.20.4.12:445',
    host: 'srv-fin-02.cybercorp.local',
    artifacts: [
      { artifactId: 'cc-pfsense-nmap-01', format: 'nmap_xml', rawContent: PFSENSE_NMAP_XML, sourceMetadata: signArtifact('cc-pfsense-nmap-01', PFSENSE_NMAP_XML) },
    ],
    specialistTasks: [
      { id: 'pfsense_rule_analysis', duration: 20 },
      { id: 'nmap_exposure_verification', duration: 14 },
    ],
    expected: {
      domain: 'pfsense',
      expectedHost: 'srv-fin-02.cybercorp.local',
      expectedFinding: 'pfsense_port_445_exception_exposed',
      minObservations: 1,
    },
  }),
  Object.freeze({
    missionId: 'cc-mission-sysmon-lateral-rundll32',
    domain: 'sysmon',
    title: 'Sysmon & Hayabusa — Corrélation EID 1/3 rundll32.exe vers 10.20.4.12:445',
    host: 'wkst-ops-07.cybercorp.local',
    artifacts: [
      { artifactId: 'cc-sysmon-evtx-01', format: 'evtx', rawContent: SYSMON_EVTX_BINARY, sourceMetadata: signArtifact('cc-sysmon-evtx-01', SYSMON_EVTX_BINARY) },
      { artifactId: 'cc-sysmon-haya-01', format: 'hayabusa_csv', rawContent: SYSMON_HAYABUSA_CSV, sourceMetadata: signArtifact('cc-sysmon-haya-01', SYSMON_HAYABUSA_CSV) },
    ],
    specialistTasks: [
      { id: 'sysmon_process_lineage', duration: 16 },
      { id: 'hayabusa_sigma_triage', duration: 11 },
    ],
    expected: {
      domain: 'sysmon',
      expectedHost: 'wkst-ops-07.cybercorp.local',
      expectedFinding: 'sysmon_rundll32_smb_lateral_connection',
      minObservations: 3,
    },
  }),
  Object.freeze({
    missionId: 'cc-mission-cross-domain-synthesis',
    domain: 'cross_domain',
    title: 'Synthèse multi-sources CyberCorp (Windows + AD + pfSense + Sysmon)',
    host: 'srv-fin-02.cybercorp.local',
    artifacts: [
      { artifactId: 'cc-synth-evtx', format: 'evtx', rawContent: WIN_EVTX_BINARY, sourceMetadata: signArtifact('cc-synth-evtx', WIN_EVTX_BINARY) },
      { artifactId: 'cc-synth-nmap', format: 'nmap_xml', rawContent: PFSENSE_NMAP_XML, sourceMetadata: signArtifact('cc-synth-nmap', PFSENSE_NMAP_XML) },
    ],
    specialistTasks: [
      { id: 'cross_host_timeline', duration: 22 },
      { id: 'trinity_hypothesis_arbitration', duration: 19 },
    ],
    expected: {
      domain: 'cross_domain',
      expectedHost: 'srv-fin-02.cybercorp.local',
      expectedFinding: 'correlated_pfsense_exception_and_smb_logon',
      minObservations: 3,
    },
  }),
]);

function executeCyberCorpEvidenceStage(item) {
  if (!Array.isArray(item.artifacts) || item.artifacts.length === 0) {
    return null;
  }
  const startNs = process.hrtime.bigint();
  const cpuStart = process.cpuUsage();
  const dossier = deo.runDigitalEvidenceOrgan(
    { artifacts: item.artifacts },
    { trustPolicy: REDACTED_TRUST_POLICY }
  );
  const scheduleProc = runProcedure({
    version: 1,
    methodId: 'lpt',
    parameters: {
      jobs: item.specialistTasks ?? [{ id: 'default_task', duration: 10 }],
      machines: 2,
    },
  });
  const matchingHost = dossier.observations.some((obs) => obs.subject.host === item.expected?.expectedHost);
  const enoughObs = dossier.observations.length >= Number(item.expected?.minObservations ?? 1);
  const findingId = detectCyberCorpFinding(item.domain, dossier.observations);
  const cpu = process.cpuUsage(cpuStart);
  return {
    deoIntact: dossier.integrity.intact && dossier.rejectedArtifacts.length === 0,
    observationCount: dossier.observations.length,
    extractionFidelityRate: dossier.extractionFidelity.overallFidelityRate,
    matchingHost,
    enoughObs,
    findingId,
    lptMakespan: scheduleProc.output.makespan,
    lptReceiptId: scheduleProc.receipt.id,
    elapsedMs: Number(process.hrtime.bigint() - startNs) / 1_000_000,
    cpuMs: (cpu.user + cpu.system) / 1000,
    rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  };
}

function hasWindowsSmbEvents(observations) {
  const auth = observations.find((obs) => obs.attributes.eventId === 4624);
  const share = observations.find((obs) => obs.attributes.eventId === 5140);
  const authData = auth?.attributes.eventData ?? {};
  const shareData = share?.attributes.eventData ?? {};
  return authData.LogonType === '3' && Boolean(authData.IpAddress)
    && shareData.IpAddress === authData.IpAddress && String(shareData.ShareName).includes('ADMIN$');
}

function hasOpenSmbPort(observations) {
  return observations.some((obs) => obs.attributes.ports?.some((port) => (
    port.portId === 445 && port.state === 'open'
  )));
}

function hasTierZeroGpoFinding(observations) {
  return observations.some((obs) => obs.attributes.settingName === 'SeDebugPrivilege'
    && obs.attributes.state === 'disabled');
}

function hasSysmonSmbConnection(observations) {
  const sysmon = observations.some((obs) => obs.attributes.eventId === 3
    && obs.attributes.eventData?.DestinationPort === '445');
  const hayabusa = observations.some((obs) => obs.sourceFormat === 'hayabusa_csv'
    && String(obs.attributes.details).includes('TEMP-WAN-DMZ-445'));
  return sysmon && hayabusa;
}

function hasCrossDomainSmbEvidence(observations) {
  return hasWindowsSmbEvents(observations) && hasOpenSmbPort(observations);
}

function detectCyberCorpFinding(domain, observations) {
  const checks = {
    windows: hasWindowsSmbEvents,
    active_directory: hasTierZeroGpoFinding,
    pfsense: hasOpenSmbPort,
    sysmon: hasSysmonSmbConnection,
    cross_domain: hasCrossDomainSmbEvidence,
  };
  const findings = {
    windows: 'lateral_smb_admin_share_access',
    active_directory: 'gpo_tier0_se_debug_disabled_anomaly',
    pfsense: 'pfsense_port_445_exception_exposed',
    sysmon: 'sysmon_rundll32_smb_lateral_connection',
    cross_domain: 'correlated_pfsense_exception_and_smb_logon',
  };
  return checks[domain]?.(observations) ? findings[domain] : null;
}

function measureShardBudget(results, budgetLimit, measurement = {}) {
  const flat = results.flat();
  const cpu = measurement.cpuStart ? process.cpuUsage(measurement.cpuStart) : { user: 0, system: 0 };
  const cpuMs = (cpu.user + cpu.system) / 1000;
  const timeMs = measurement.startNs
    ? Number(process.hrtime.bigint() - measurement.startNs) / 1_000_000
    : flat.reduce((sum, result) => sum + Number(result.cyberCorpEvidence?.elapsedMs ?? 0), 0);
  const ramMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  const tokens = 0;
  const cycles = flat.length;
  const withinBudget = cpuMs <= budgetLimit.cpuMs
    && ramMb <= budgetLimit.ramMb
    && tokens <= budgetLimit.tokens
    && cycles <= budgetLimit.cycles
    && timeMs <= budgetLimit.timeMs;
  return Object.freeze({
    cpuMs,
    ramMb,
    tokens,
    cycles,
    timeMs,
    withinBudget,
  });
}

function createSanitizedReceiptInput(item) {
  return {
    missionId: item.missionId ?? null,
    domain: item.domain ?? null,
    title: item.title ?? null,
    expectedFinding: item.expected?.expectedFinding ?? null,
    artifactIds: (item.artifacts ?? []).map((artifact) => artifact.artifactId),
  };
}

module.exports = {
  REDACTED_TRUST_POLICY,
  CYBERCORP_MISSION_CORPUS,
  executeCyberCorpEvidenceStage,
  measureShardBudget,
  createSanitizedReceiptInput,
};

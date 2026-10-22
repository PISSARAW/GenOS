'use strict';

const assert = require('node:assert/strict');
const deo = require('../src/services/digitalEvidenceOrgan');

const TRUST_SECRET = 'genos-deo-collector-secret-key-2026-32b';
const COLLECTOR_ID = 'sensor:dfir-win-01';

function signedSource(artifactId, rawContent, extra = {}) {
  const rawHash = deo.sha256Digest(rawContent);
  return {
    collectorId: COLLECTOR_ID,
    sourceUri: `forensic://vault/${artifactId}`,
    collectedAt: '2026-10-22T12:00:00Z',
    signature: deo.computeSourceSignature({ artifactId, rawHash, collectorId: COLLECTOR_ID }, TRUST_SECRET),
    ...extra,
  };
}

const VALID_EVTX_XML = `<Events>
  <Event>
    <System>
      <EventID>4624</EventID>
      <EventRecordID>9001</EventRecordID>
      <TimeCreated SystemTime="2026-10-22T10:00:00Z" />
      <Computer>DC01.corp.local</Computer>
      <Channel>Security</Channel>
    </System>
    <EventData>
      <Data Name="TargetUserName">alice</Data>
      <Data Name="ProcessName">C:\\Windows\\System32\\lsass.exe</Data>
      <Data Name="IpAddress">10.0.0.42</Data>
    </EventData>
  </Event>
</Events>`;

const VALID_NMAP_XML = `<nmaprun scanner="nmap" start="1792663230" version="7.94">
  <host starttime="1792663230">
    <address addr="10.0.0.10" addrtype="ipv4" />
    <hostnames><hostname name="DC01.corp.local" type="PTR" /></hostnames>
    <ports>
      <port protocol="tcp" portid="445">
        <state state="open" />
        <service name="microsoft-ds" />
      </port>
    </ports>
  </host>
</nmaprun>`;

const VALID_HAYABUSA_CSV = [
  'Timestamp,Computer,Channel,EventID,Level,RuleTitle,User,Process,Details',
  '2026-10-22T10:01:00Z,DC01.corp.local,Security,4688,high,"Suspicious LSASS Access",alice,C:\\Windows\\System32\\lsass.exe,"Access granted"',
].join('\n');

const VALID_GPO_XML = `<GPO>
  <Name>Default Domain Controllers Policy</Name>
  <Domain>corp.local</Domain>
  <ReadTime>2026-10-22T10:02:00Z</ReadTime>
  <Policy>
    <Name>SeDebugPrivilege</Name>
    <State>Enabled</State>
    <Category>Computer/UserRights</Category>
    <Computer>DC01.corp.local</Computer>
    <User>alice</User>
  </Policy>
</GPO>`;

const VALID_CONFTEST_JSON = JSON.stringify([
  {
    filename: 'policy/domain-controller.tf',
    namespace: 'main',
    host: 'DC01.corp.local',
    user: 'alice',
    process: 'conftest',
    timestamp: '2026-10-22T10:03:00Z',
    successes: 4,
    failures: [{ msg: 'SMB signing must be required on DC01', rule: 'smb_signing_required' }],
    warnings: [],
  },
]);

function testAllFiveFormatsAndRawPreservation() {
  const originalEvtxBuffer = Buffer.from(VALID_EVTX_XML, 'utf8');
  const snapshotBefore = Buffer.from(originalEvtxBuffer);

  const artifacts = [
    { artifactId: 'art-evtx-1', format: 'evtx', rawContent: originalEvtxBuffer, sourceMetadata: signedSource('art-evtx-1', originalEvtxBuffer) },
    { artifactId: 'art-nmap-1', format: 'nmap_xml', rawContent: VALID_NMAP_XML, sourceMetadata: signedSource('art-nmap-1', VALID_NMAP_XML) },
    { artifactId: 'art-haya-1', format: 'hayabusa_csv', rawContent: VALID_HAYABUSA_CSV, sourceMetadata: signedSource('art-haya-1', VALID_HAYABUSA_CSV) },
    { artifactId: 'art-gpo-1', format: 'gpo_report', rawContent: VALID_GPO_XML, sourceMetadata: signedSource('art-gpo-1', VALID_GPO_XML) },
    { artifactId: 'art-conf-1', format: 'conftest', rawContent: VALID_CONFTEST_JSON, sourceMetadata: signedSource('art-conf-1', VALID_CONFTEST_JSON) },
  ];

  const dossier = deo.runDigitalEvidenceOrgan(
    { artifacts },
    {
      trustPolicy: {
        trustedCollectors: [COLLECTOR_ID],
        collectorSecrets: { [COLLECTOR_ID]: TRUST_SECRET },
      },
    },
  );

  assert.equal(dossier.ingestedArtifacts.length, 5);
  assert.equal(dossier.rejectedArtifacts.length, 0);
  assert.equal(dossier.observations.length, 5);
  assert.equal(dossier.integrity.intact, true);
  assert.equal(Buffer.compare(originalEvtxBuffer, snapshotBefore), 0);
  assert.equal(Buffer.compare(dossier.rawVault.get('art-evtx-1').rawBytes, snapshotBefore), 0);

  // Correlation checks (host, user, process, period)
  assert.equal(dossier.correlations.byHost.length, 1);
  assert.equal(dossier.correlations.byHost[0].pivotValue, 'dc01.corp.local');
  assert.equal(dossier.correlations.byHost[0].observationIds.length, 5);
  assert.equal(dossier.correlations.byUser[0].pivotValue, 'alice');
  assert.equal(dossier.correlations.byProcess.some((c) => c.pivotValue.includes('lsass.exe')), true);
  assert.equal(dossier.correlations.byPeriod.length, 1);

  // Binary MsgPack round-trip & standard interoperable export
  const decoded = deo.decodeTypedBinary(dossier.binaryFrame);
  assert.deepEqual(decoded, dossier.standardExport);
  assert.equal(dossier.promotionGate.authorizesPromotion, false);
}

function testMandatoryScenario1CorruptedFiles() {
  assert.throws(
    () => deo.ingestArtifact({ artifactId: 'bad-evtx', format: 'evtx', rawContent: '<Events><Broken' }),
    { code: 'DEO_CORRUPTED_ARTIFACT' },
  );
  assert.throws(
    () => deo.ingestArtifact({ artifactId: 'bad-json', format: 'conftest', rawContent: '{not-valid-json' }),
    { code: 'DEO_CORRUPTED_ARTIFACT' },
  );
  assert.throws(
    () => deo.ingestArtifact({ artifactId: 'bad-csv', format: 'hayabusa_csv', rawContent: 'Timestamp,Computer\n"unterminated,DC01' }),
    { code: 'DEO_CORRUPTED_ARTIFACT' },
  );
}

function testMandatoryScenario2DuplicateEvents() {
  const duplicatedEvtx = `<Events>
    <Event>
      <System><EventID>4624</EventID><EventRecordID>9001</EventRecordID><TimeCreated SystemTime="2026-10-22T10:00:00Z" /><Computer>DC01.corp.local</Computer></System>
      <EventData><Data Name="TargetUserName">alice</Data></EventData>
    </Event>
    <Event>
      <System><EventID>4624</EventID><EventRecordID>9001</EventRecordID><TimeCreated SystemTime="2026-10-22T10:00:00Z" /><Computer>DC01.corp.local</Computer></System>
      <EventData><Data Name="TargetUserName">alice</Data></EventData>
    </Event>
  </Events>`;
  const ingested = deo.ingestArtifact({ artifactId: 'dup-evtx', format: 'evtx', rawContent: duplicatedEvtx });
  const normalized = deo.normalizeIngestedArtifact(ingested);
  assert.equal(normalized.observations.length, 1);
  assert.equal(normalized.duplicateCount, 1);
}

function testMandatoryScenario3ContradictoryTimestamps() {
  const evtxA = `<Events><Event><System><EventID>4624</EventID><EventRecordID>555</EventRecordID><TimeCreated SystemTime="2026-10-22T10:00:00Z" /><Computer>DC01.corp.local</Computer></System></Event></Events>`;
  const evtxB = `<Events><Event><System><EventID>4624</EventID><EventRecordID>555</EventRecordID><TimeCreated SystemTime="2026-10-22T11:30:00Z" /><Computer>DC01.corp.local</Computer></System></Event></Events>`;

  const dossier = deo.runDigitalEvidenceOrgan({
    artifacts: [
      { artifactId: 'ts-a', format: 'evtx', rawContent: evtxA, sourceMetadata: signedSource('ts-a', evtxA) },
      { artifactId: 'ts-b', format: 'evtx', rawContent: evtxB, sourceMetadata: signedSource('ts-b', evtxB) },
    ],
  });

  assert.equal(dossier.conflicts.hasContradictions, true);
  assert.equal(dossier.conflicts.epistemicStance, 'suspended_judgment');
  assert.equal(dossier.conflicts.inventedConclusion, null);
  assert.equal(dossier.conflicts.contradictions[0].conflictType, 'contradictory_timestamps');
  assert.equal(dossier.promotionGate.silentPromotionBlocked, true);
}

function testMandatoryScenario4IncompleteExport() {
  const truncatedEvtx = `<Events><Event><System><EventID>4624</EventID><TimeCreated SystemTime="2026-10-22T10:00:00Z" /><Computer>DC01</Computer></System></Event><Event>`;
  const truncatedNmap = `<nmaprun scanner="nmap" start="1792663230"><host><address addr="10.0.0.1" /></host>`;

  assert.throws(
    () => deo.ingestArtifact({ artifactId: 'trunc-evtx', format: 'evtx', rawContent: truncatedEvtx }),
    { code: 'DEO_INCOMPLETE_EXPORT' },
  );
  assert.throws(
    () => deo.ingestArtifact({ artifactId: 'trunc-nmap', format: 'nmap_xml', rawContent: truncatedNmap }),
    { code: 'DEO_INCOMPLETE_EXPORT' },
  );
}

function testMandatoryScenario5MissingEvidenceAndIntegrity() {
  assert.throws(() => deo.runDigitalEvidenceOrgan({ artifacts: [] }), { code: 'DEO_MISSING_EVIDENCE' });

  const emptyVerification = deo.verifyEvidenceIntegrity({ observations: [] });
  assert.equal(emptyVerification.intact, false);
  assert.equal(emptyVerification.violations[0].code, 'DEO_MISSING_EVIDENCE');

  const ingested = deo.ingestArtifact({
    artifactId: 'art-evtx-int',
    format: 'evtx',
    rawContent: VALID_EVTX_XML,
    sourceMetadata: signedSource('art-evtx-int', VALID_EVTX_XML),
  });
  const norm = deo.normalizeIngestedArtifact(ingested);
  const prov = deo.attachProvenance(ingested, norm);

  // Missing raw artifact in vault
  const missingRawCheck = deo.verifyEvidenceIntegrity({ rawArtifacts: new Map(), observations: prov.observations });
  assert.equal(missingRawCheck.intact, false);
  assert.equal(missingRawCheck.violations[0].code, 'DEO_MISSING_EVIDENCE');

  // Altered observation attribute
  const tamperedObs = { ...prov.observations[0], severity: 'low' };
  const tamperedCheck = deo.verifyEvidenceIntegrity({
    rawArtifacts: { 'art-evtx-int': ingested },
    observations: [tamperedObs],
  });
  assert.equal(tamperedCheck.intact, false);
  assert.equal(tamperedCheck.violations.some((v) => v.code === 'DEO_OBSERVATION_TAMPERED'), true);
}

function testMandatoryScenario6ForgedSource() {
  const ing = deo.ingestArtifact({
    artifactId: 'forged-art',
    format: 'evtx',
    rawContent: VALID_EVTX_XML,
    sourceMetadata: {
      collectorId: 'attacker:rogue-node',
      sourceUri: 'forensic://rogue',
      signature: '0'.repeat(64),
    },
  });
  const norm = deo.normalizeIngestedArtifact(ing);

  assert.throws(
    () => deo.attachProvenance(ing, norm, {
      trustPolicy: {
        trustedCollectors: [COLLECTOR_ID],
        collectorSecrets: { [COLLECTOR_ID]: TRUST_SECRET },
      },
    }),
    { code: 'DEO_FORGED_SOURCE' },
  );
}

function testMandatoryScenario7UnknownEvent() {
  const unknownEvtx = `<Events><Event><System><EventID>99999</EventID><TimeCreated SystemTime="2026-10-22T10:00:00Z" /><Computer>DC01</Computer></System></Event></Events>`;
  const ing = deo.ingestArtifact({ artifactId: 'unk-evtx', format: 'evtx', rawContent: unknownEvtx });
  assert.throws(() => deo.normalizeIngestedArtifact(ing), { code: 'DEO_UNKNOWN_EVENT' });
}

function testRetentionMinimizationAndRevocation() {
  const dossier = deo.runDigitalEvidenceOrgan({
    artifacts: [
      { artifactId: 'ret-1', format: 'evtx', rawContent: VALID_EVTX_XML, sourceMetadata: signedSource('ret-1', VALID_EVTX_XML) },
      { artifactId: 'ret-2', format: 'nmap_xml', rawContent: VALID_NMAP_XML, sourceMetadata: signedSource('ret-2', VALID_NMAP_XML) },
    ],
  }, {
    retentionPolicy: {
      tier: 'short_term',
      now: '2026-10-23T10:00:00Z',
      revokedArtifactIds: ['ret-2'],
      minimization: { enabled: true, redactUsers: true },
    },
  });

  assert.equal(dossier.retention.revokedCount, 1);
  assert.equal(dossier.retention.retainedCount, 1);
  assert.equal(dossier.retention.retained[0].minimized, true);
  assert.equal(dossier.retention.retained[0].subject.user.startsWith('redacted:'), true);
}

function testSealedTrialCorpusValidationCriterion() {
  const sealedCorpus = [
    { artifactId: 'sealed-valid-evtx', format: 'evtx', rawContent: VALID_EVTX_XML, sourceMetadata: signedSource('sealed-valid-evtx', VALID_EVTX_XML), expectedOutcome: 'ingested' },
    { artifactId: 'sealed-valid-nmap', format: 'nmap_xml', rawContent: VALID_NMAP_XML, sourceMetadata: signedSource('sealed-valid-nmap', VALID_NMAP_XML), expectedOutcome: 'ingested' },
    { artifactId: 'sealed-valid-haya', format: 'hayabusa_csv', rawContent: VALID_HAYABUSA_CSV, sourceMetadata: signedSource('sealed-valid-haya', VALID_HAYABUSA_CSV), expectedOutcome: 'ingested' },
    { artifactId: 'sealed-valid-gpo', format: 'gpo_report', rawContent: VALID_GPO_XML, sourceMetadata: signedSource('sealed-valid-gpo', VALID_GPO_XML), expectedOutcome: 'ingested' },
    { artifactId: 'sealed-valid-conf', format: 'conftest', rawContent: VALID_CONFTEST_JSON, sourceMetadata: signedSource('sealed-valid-conf', VALID_CONFTEST_JSON), expectedOutcome: 'ingested' },
    { artifactId: 'sealed-corrupt-evtx', format: 'evtx', rawContent: '<Events><Corrupt', sourceMetadata: signedSource('sealed-corrupt-evtx', '<Events><Corrupt'), expectedOutcome: 'rejected' },
    { artifactId: 'sealed-incomplete-nmap', format: 'nmap_xml', rawContent: '<nmaprun start="1792663230">', sourceMetadata: signedSource('sealed-incomplete-nmap', '<nmaprun start="1792663230">'), expectedOutcome: 'rejected' },
    { artifactId: 'sealed-forged-gpo', format: 'gpo_report', rawContent: VALID_GPO_XML, sourceMetadata: { collectorId: 'forged-agent', sourceUri: 'forensic://bad', signature: 'bad' }, expectedOutcome: 'rejected' },
    { artifactId: 'sealed-unknown-evtx', format: 'evtx', rawContent: '<Events><Event><System><EventID>77777</EventID><TimeCreated SystemTime="2026-10-22T10:00:00Z"/><Computer>DC01</Computer></System></Event></Events>', sourceMetadata: signedSource('sealed-unknown-evtx', '<Events><Event><System><EventID>77777</EventID><TimeCreated SystemTime="2026-10-22T10:00:00Z"/><Computer>DC01</Computer></System></Event></Events>'), expectedOutcome: 'rejected' },
  ];

  const result = deo.runDigitalEvidenceOrgan(
    { artifacts: sealedCorpus },
    {
      trustPolicy: {
        trustedCollectors: [COLLECTOR_ID],
        collectorSecrets: { [COLLECTOR_ID]: TRUST_SECRET },
      },
    },
  );

  const ingestedIds = new Set(result.ingestedArtifacts.map((a) => a.artifactId));
  const rejectedIds = new Set(result.rejectedArtifacts.map((a) => a.artifactId));

  // 100% of sealed corpus artifacts are accounted for (either properly ingested or explicitly rejected)
  assert.equal(ingestedIds.size + rejectedIds.size, sealedCorpus.length);
  for (const item of sealedCorpus) {
    if (item.expectedOutcome === 'ingested') {
      assert.equal(ingestedIds.has(item.artifactId), true, `Expected ${item.artifactId} to be ingested`);
    } else {
      assert.equal(rejectedIds.has(item.artifactId), true, `Expected ${item.artifactId} to be rejected`);
      const rej = result.rejectedArtifacts.find((r) => r.artifactId === item.artifactId);
      assert.equal(rej.promotionAllowed, false);
    }
  }
  assert.equal(result.promotionGate.silentPromotionBlocked, true);
  assert.equal(result.promotionGate.promotionEligible, false);
}

testAllFiveFormatsAndRawPreservation();
testMandatoryScenario1CorruptedFiles();
testMandatoryScenario2DuplicateEvents();
testMandatoryScenario3ContradictoryTimestamps();
testMandatoryScenario4IncompleteExport();
testMandatoryScenario5MissingEvidenceAndIntegrity();
testMandatoryScenario6ForgedSource();
testMandatoryScenario7UnknownEvent();
testRetentionMinimizationAndRevocation();
testSealedTrialCorpusValidationCriterion();

process.stdout.write('Digital Evidence Organ (DEO) suite: PASS (100% sealed corpus validated, 0 silent promotions).\n');

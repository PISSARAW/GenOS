'use strict';

/**
 * Tests du verificateur claim-to-evidence (Chantier 5).
 *
 * Couvre :
 *  - traçabilité à 100 % du corpus de rapports de référence,
 *  - signalement des preuves manquantes ou attendues omises,
 *  - échec de vérification lors d'une modification artificielle des sources,
 *  - blocage des sophismes (« aucun événement observé » -> « aucune attaque »,
 *    « fichier inchangé » -> « fichier jamais consulté »).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extractClaims,
  extractEvidenceStore,
  detectFallacy,
  verifyClaim,
  verifyReport,
  verifyCorpus,
  isMeaningfulEvidence,
  sha256Hex,
} = require('./claimEvidenceVerifier');

const ROOT = path.join(__dirname);
const SAMPLE_CORPUS = path.join(ROOT, 'sample-corpus');
const REFERENCE_CORPUS = path.join(ROOT, 'reference-corpus');
const EVIDENCE_STORE = path.join(ROOT, 'evidence-store');

function writeTempFile(dir, name, content) {
  const fullPath = path.join(dir, name);
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function testExtractClaims() {
  const report = {
    title: 'test',
    claims: [
      { id: 'c1', statement: 'Le port 22 est filtre.', evidence: ['ev1.txt'] },
      { statement: 'Claim sans id.', evidence: [] },
      { id: 'c3', statement: '', evidence: [] },
    ],
    findings: [{ statement: 'Finding extra.', evidence: ['ev2.txt'] }],
  };
  const claims = extractClaims(report);
  assert.strictEqual(claims.length, 3);
  assert.strictEqual(claims[0].id, 'c1');
  assert.strictEqual(claims[0].statement, 'Le port 22 est filtre.');
  assert.deepStrictEqual(claims[0].evidenceRefs, ['ev1.txt']);
  assert.strictEqual(claims[1].id.startsWith('claim-'), true);
  assert.strictEqual(claims[2].statement, 'Finding extra.');
  console.log('  ✅ testExtractClaims OK');
}

function testEvidenceStore() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cte-evidence-'));
  try {
    writeTempFile(tmpDir, 'a.txt', 'contenu A');
    writeTempFile(tmpDir, 'b.txt', 'contenu B');
    const store = extractEvidenceStore(tmpDir);
    assert.strictEqual(store.size, 2);
    assert.strictEqual(store.get('a.txt').hash, sha256Hex('contenu A'));
    const emptyStore = extractEvidenceStore(path.join(os.tmpdir(), 'repertoire-inexistant-12345'));
    assert.strictEqual(emptyStore.size, 0);
    console.log('  ✅ testEvidenceStore OK');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testDetectFallacyAbsenceToNoAttack() {
  const report = {
    claims: [{ statement: 'Aucun evenement observe donc aucune attaque.' }],
  };
  const fallacies = detectFallacy(report);
  assert.strictEqual(fallacies.length, 1);
  assert.strictEqual(fallacies[0].type, 'absence_of_event_to_no_attack');
  const clean = { claims: [{ statement: 'Aucun evenement observe, mais l analyse se poursuit.' }] };
  assert.strictEqual(detectFallacy(clean).length, 0);
  console.log('  ✅ testDetectFallacyAbsenceToNoAttack OK');
}

function testDetectFallacyUnchangedToNeverAccessed() {
  const report = {
    claims: [{ statement: 'Fichier inchangé donc jamais consulte.' }],
  };
  const fallacies = detectFallacy(report);
  assert.strictEqual(fallacies.length, 1);
  assert.strictEqual(fallacies[0].type, 'unchanged_file_to_never_accessed');
  console.log('  ✅ testDetectFallacyUnchangedToNeverAccessed OK');
}

function testVerifyClaimMissingEvidence() {
  const store = new Map();
  const claim = { id: 'c1', statement: 'X.', evidenceRefs: [], source: 's' };
  const result = verifyClaim(claim, store);
  assert.strictEqual(result.status, 'missing_evidence');
  assert.strictEqual(result.evidenceAttached, false);
  console.log('  ✅ testVerifyClaimMissingEvidence OK');
}

function testVerifyClaimVerified() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cte-verified-'));
  try {
    writeTempFile(tmpDir, 'ev.txt', 'preuve concrete');
    const store = extractEvidenceStore(tmpDir);
    const claim = {
      id: 'c1',
      statement: 'Le port 22 est filtre.',
      evidenceRefs: ['ev.txt'],
      source: 's',
    };
    const result = verifyClaim(claim, store);
    assert.strictEqual(result.status, 'verified');
    assert.deepStrictEqual(result.evidenceFound, ['ev.txt']);
    assert.deepStrictEqual(result.evidenceMissing, []);
    console.log('  ✅ testVerifyClaimVerified OK');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testArtificialSourceModificationFailsVerification() {
  const tmpEvidence = fs.mkdtempSync(path.join(os.tmpdir(), 'cte-tamper-'));
  try {
    for (const file of fs.readdirSync(EVIDENCE_STORE)) {
      fs.copyFileSync(path.join(EVIDENCE_STORE, file), path.join(tmpEvidence, file));
    }
    const cleanSummary = verifyCorpus(REFERENCE_CORPUS, tmpEvidence);
    assert.strictEqual(cleanSummary.allVerified, true, 'Reference corpus must pass before tampering');

    const apresPath = path.join(tmpEvidence, 'nmap-export-apres.json');
    const tampered = fs.readFileSync(apresPath, 'utf8').replace('"filtered"', '"open"');
    fs.writeFileSync(apresPath, tampered, 'utf8');

    const tamperedSummary = verifyCorpus(REFERENCE_CORPUS, tmpEvidence);
    assert.strictEqual(tamperedSummary.allVerified, false, 'Artificial modification of source must fail verification');
    assert.ok(tamperedSummary.totalMissing > 0);
    console.log('  ✅ testArtificialSourceModificationFailsVerification OK');
  } finally {
    fs.rmSync(tmpEvidence, { recursive: true, force: true });
  }
}

function testVerifyReferenceCorpusAllTraceable() {
  const summary = verifyCorpus(REFERENCE_CORPUS, EVIDENCE_STORE);
  assert.strictEqual(summary.reportCount, 1);
  assert.strictEqual(summary.allVerified, true);
  assert.strictEqual(summary.totalClaims, 2);
  assert.strictEqual(summary.totalVerified, 2);
  assert.strictEqual(summary.totalMissing, 0);
  assert.strictEqual(summary.totalFallacies, 0);
  assert.ok(summary.results[0].claims[0].limit.includes("absence d'autres chemins réseau"));
  console.log('  ✅ testVerifyReferenceCorpusAllTraceable OK');
}

function testVerifyCorpusSample() {
  const summary = verifyCorpus(SAMPLE_CORPUS, EVIDENCE_STORE);
  assert.strictEqual(summary.reportCount, 2);
  assert.strictEqual(summary.allVerified, false);
  assert.ok(summary.totalMissing > 0);

  const networkReport = summary.results.find((r) => r.report === 'network-port-closure.json');
  assert.ok(networkReport);
  const noPathClaim = networkReport.claims.find((c) => c.claimId === 'claim-no-other-network-paths');
  assert.strictEqual(noPathClaim.status, 'missing_evidence');

  const suspiciousReport = summary.results.find((r) => r.report === 'suspicious-ids-alert.json');
  assert.ok(suspiciousReport);
  assert.ok(suspiciousReport.fallacies.length > 0);
  console.log('  ✅ testVerifyCorpusSample OK');
}

function testIsMeaningfulEvidenceAndMissingFile() {
  assert.strictEqual(isMeaningfulEvidence('nmap-export.json'), true);
  assert.strictEqual(isMeaningfulEvidence(''), false);
  assert.strictEqual(isMeaningfulEvidence('none'), false);
  assert.strictEqual(isMeaningfulEvidence('N/A'), false);
  const result = verifyReport(path.join(os.tmpdir(), 'n-existe-pas.json'), new Map());
  assert.strictEqual(result.overallStatus, 'error');
  console.log('  ✅ testIsMeaningfulEvidenceAndMissingFile OK');
}

function run() {
  testExtractClaims();
  testEvidenceStore();
  testDetectFallacyAbsenceToNoAttack();
  testDetectFallacyUnchangedToNeverAccessed();
  testVerifyClaimMissingEvidence();
  testVerifyClaimVerified();
  testVerifyReferenceCorpusAllTraceable();
  testArtificialSourceModificationFailsVerification();
  testVerifyCorpusSample();
  testIsMeaningfulEvidenceAndMissingFile();
  console.log('\nTous les tests claim-to-evidence sont passés.');
}

run();

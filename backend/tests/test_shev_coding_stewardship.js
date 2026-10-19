'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { memoryDb } = require('./ontogenesisFixture');
const { createProject } = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const stewardship = require('../src/services/shev/codingStewardshipService');

const ORGANIZATION = 'org-codex-rival';

function scope(projectId, missionId = 'mission-codex-rival') {
  return { organizationId: ORGANIZATION, projectId, missionId };
}

async function fixture(filename = ':memory:', projectId = 'project-codex-rival') {
  const db = await memoryDb(filename);
  const existing = await db.get('SELECT id FROM ontogenesis_projects WHERE id=?', projectId);
  if (!existing) {
    await createProject(db, { id: projectId, rootPath: 'D:\\GenOS-codex-rival',
      branch: 'codex/rival', objective: 'garder la responsabilité après livraison' });
    await registerResponsibility(db, { projectId, authorityRef: 'authority:owner',
      mandate: { purpose: 'Améliorer durablement le projet', autoDiagnose: true,
        autoInstrument: true, dimensions: [{ name: 'quality', expected: 'stable',
          acceptance: ['tests indépendants', 'effet projet observé'] }] } });
  }
  return db;
}

async function register(db, projectId, missionId = 'mission-codex-rival') {
  return stewardship.registerCodingMission(db, { ...scope(projectId, missionId),
    ownerAgentId: 'agent-coder', objective: 'corriger puis vérifier le bénéfice projet', nowMs: 1000 });
}

async function verifyEvidenceLadder() {
  const db = await fixture();
  const projectId = 'project-codex-rival';
  await register(db, projectId);
  const claim = await stewardship.claimCodingMission(db, {
    ...scope(projectId), nowMs: 2000, leaseMs: 10000
  });

  const transported = await stewardship.recordTransportAccepted(db, {
    ...scope(projectId), token: claim.token, transportReceiptRef: 'transport:accepted', nowMs: 2100
  });
  assert.equal(transported.missionComplete, false);
  assert.equal(transported.proofLevel, 'transport');
  assert.deepEqual(await stewardship.recommendEndogenousFollowup(db, scope(projectId)),
    { kind: 'verify_delivery', reason: 'transport-is-not-proof',
      causalParentEventId: transported.event.eventId, authority: 'proposal-only',
      promotionAllowed: false, boundaries: stewardship.BOUNDARIES });

  await assert.rejects(stewardship.recordDeliveryVerified(db, {
    ...scope(projectId), token: claim.token, verifierRef: 'agent-coder',
    evidenceRefs: ['test:self'], nowMs: 2200
  }), (error) => error.code === 'SHEV_CODING_VERIFIER_NOT_INDEPENDENT');

  const delivered = await stewardship.recordDeliveryVerified(db, {
    ...scope(projectId), token: claim.token, verifierRef: 'verifier-independent',
    evidenceRefs: ['test:green', 'diff:reviewed'], nowMs: 2300
  });
  assert.equal(delivered.missionComplete, false);
  assert.equal((await stewardship.recommendEndogenousFollowup(db, scope(projectId))).kind,
    'measure_project_effect');

  const neutral = await stewardship.recordProjectEffect(db, {
    ...scope(projectId), result: 'neutral', verifierRef: 'observer-independent',
    evidenceRefs: ['metric:no-change'], beforeObservationRef: 'metric:before',
    afterObservationRef: 'metric:after', nowMs: 2400
  });
  assert.equal(neutral.missionComplete, false);
  assert.equal((await stewardship.recommendEndogenousFollowup(db, scope(projectId))).kind,
    'diagnose_missing_effect');

  const improved = await stewardship.recordProjectEffect(db, {
    ...scope(projectId), result: 'improved', verifierRef: 'observer-independent',
    evidenceRefs: ['metric:improved'], beforeObservationRef: 'metric:before',
    afterObservationRef: 'metric:after-fix', nowMs: 2500
  });
  assert.equal(improved.missionComplete, true);
  assert.equal((await stewardship.recommendEndogenousFollowup(db, scope(projectId))).kind,
    'observe_project_effect');
  const view = await stewardship.readCodingMission(db, scope(projectId));
  assert.equal(view.causalIntegrity, 'verified');
  assert.deepEqual(view.events.map((event) => event.kind), [
    'mission_registered', 'attempt_claimed', 'transport_accepted',
    'delivery_verified', 'project_effect_neutral', 'project_effect_improved'
  ]);
  await assert.rejects(db.run(`UPDATE shev_coding_events SET kind='forged'
    WHERE mission_id=?`, scope(projectId).missionId), /immutable/);
  await db.close();
}

async function verifySafeRestart() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shev-coding-stewardship-'));
  const filename = path.join(root, 'stewardship.db');
  const projectId = 'project-codex-restart';
  const missionId = 'mission-codex-restart';
  let db;
  try {
    db = await fixture(filename, projectId);
    await register(db, projectId, missionId);
    const first = await stewardship.claimCodingMission(db, {
      ...scope(projectId, missionId), nowMs: 1000, leaseMs: 1000
    });
    await stewardship.recordTransportAccepted(db, {
      ...scope(projectId, missionId), token: first.token,
      transportReceiptRef: 'transport:unknown-after-crash', nowMs: 1500
    });
    await db.close();

    db = await fixture(filename, projectId);
    const recovered = await stewardship.readCodingMission(db, scope(projectId, missionId));
    assert.equal(recovered.causalIntegrity, 'verified');
    assert.equal(recovered.attempt.status, 'transported');
    const ambiguous = await stewardship.markExpiredAttempt(db, {
      ...scope(projectId, missionId), nowMs: 2001
    });
    assert.equal(ambiguous.blindRetryAllowed, false);
    assert.equal((await stewardship.recommendEndogenousFollowup(db,
      scope(projectId, missionId))).kind, 'reconcile_ambiguous_operation');
    await assert.rejects(stewardship.claimCodingMission(db, {
      ...scope(projectId, missionId), nowMs: 2100
    }), (error) => error.code === 'SHEV_CODING_RESUME_BLOCKED');

    const reconciled = await stewardship.reconcileAmbiguousAttempt(db, {
      ...scope(projectId, missionId), outcome: 'not_applied',
      verifierRef: 'reconciler-independent', evidenceRefs: ['remote:no-effect'], nowMs: 2200
    });
    assert.equal(reconciled.resumeAllowed, true);
    const second = await stewardship.claimCodingMission(db, {
      ...scope(projectId, missionId), nowMs: 2300, leaseMs: 1000
    });
    assert.equal(second.generation, 2);
    await assert.rejects(stewardship.recordTransportAccepted(db, {
      ...scope(projectId, missionId), token: first.token,
      transportReceiptRef: 'transport:late-first-worker', nowMs: 2400
    }), (error) => error.code === 'SHEV_CODING_ATTEMPT_FENCED');
    const accepted = await stewardship.recordTransportAccepted(db, {
      ...scope(projectId, missionId), token: second.token,
      transportReceiptRef: 'transport:second-worker', nowMs: 2400
    });
    assert.equal(accepted.missionComplete, false);
  } finally {
    if (db) await db.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  await verifyEvidenceLadder();
  await verifySafeRestart();
  console.log('SHEV coding stewardship checks passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const rhizome = require('../src/services/rhizomeCoordinationService');
const adapter = require('../src/services/rhizome/variants/daemonRhizomeAdapter');
const daemonStigmergy = require('../src/services/daemon/daemonStigmergyService');

async function run() {
  const filename = path.join(os.tmpdir(), `rhizome-daemon-${crypto.randomUUID()}.db`);
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    const session = await rhizome.composeRhizome('Import trusted daemon observations.', { db });
    const marker = { territoryId: 'repo-a', scope: 'workspace', kind: 'VERIFIED_OK', intensity: 4, evidenceId: 'check-7' };
    const input = {
      db, sessionId: session.sessionId, marker,
      trust: {
        identityContext: { identityDigest: 'daemon-digest', providerId: 'daemon-provider' },
        trustedIdentityDigests: ['daemon-digest']
      }
    };
    const first = await adapter.record(input);
    const second = await adapter.record(input);
    assert.equal(first.recorded, true);
    assert.equal(first.trail.trail.kind, 'VERIFIED_RESULT');
    assert.equal(first.trail.trail.evidenceRefs[0], 'check-7');
    assert.ok(second.trail.trail.intensity <= first.trail.trail.intensity);
    assert.ok(second.trail.trail.intensity > 1.9);
    const daemonRecord = await daemonStigmergy.getMarker(db, marker);
    assert.equal(daemonRecord.intensity, 8);
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
}

run().then(() => console.log('Rhizome daemon adapter checks: PASS')).catch((error) => {
  console.error('Rhizome daemon adapter test failed:', error);
  process.exit(1);
});

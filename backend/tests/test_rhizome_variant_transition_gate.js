'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const rhizome = require('../src/services/rhizomeCoordinationService');

async function main() {
  const filename = path.join(os.tmpdir(), `genos-rhizome-transition-${randomUUID()}.db`);
  let db = await open({ filename, driver: sqlite3.Database });
  try {
    const routing = await rhizome.composeRhizome('Route a verified capability.', { db, variant: 'routing' });
    const switched = await rhizome.setVariant(routing.sessionId, 'exploratory', { db });
    assert.equal(switched.priorVariant, 'routing');
    assert.equal(switched.variant, 'exploratory');
    assert.equal(switched.graphVersion, 0);
    const before = await db.get('SELECT revision, state_json FROM topology_sessions WHERE id = ?', routing.sessionId);
    const eventsBefore = await db.get('SELECT COUNT(*) AS count FROM topology_session_events WHERE session_id = ?', routing.sessionId);
    for (const variant of ['private', 'persistent', 'ephemeral', 'procedural', 'cross_representation']) {
      await assert.rejects(rhizome.setVariant(routing.sessionId, variant, { db }),
        { code: 'RHIZOME_VARIANT_TRANSITION_REQUIRES_NEW_SESSION' });
    }
    const after = await db.get('SELECT revision, state_json FROM topology_sessions WHERE id = ?', routing.sessionId);
    const eventsAfter = await db.get('SELECT COUNT(*) AS count FROM topology_session_events WHERE session_id = ?', routing.sessionId);
    assert.deepEqual(after, before);
    assert.deepEqual(eventsAfter, eventsBefore);
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    assert.equal((await rhizome.getVariantPolicy(routing.sessionId, { db })).name, 'exploratory');

    const confidential = await rhizome.composeRhizome('Keep private routes private.', { db, variant: 'private' });
    await assert.rejects(rhizome.setVariant(confidential.sessionId, 'routing', { db }),
      { code: 'RHIZOME_VARIANT_TRANSITION_REQUIRES_NEW_SESSION' });
    assert.equal((await rhizome.getVariantPolicy(confidential.sessionId, { db })).name, 'private');
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
  console.log('Rhizome variant transitions preserve session-bound contracts: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

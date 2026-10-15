'use strict';

const assert = require('node:assert/strict');
const persistence = require('../src/services/telemetryPersist');

async function run() {
  const writes = [];
  let secondary;
  const db = { run: async (sql) => { writes.push(sql); } };
  const observer = {
    deferSideEffect: (effect) => { secondary = effect; },
    persistWorkspaceMilestone: async () => new Promise(() => {}),
    generateWorkspaceReadme: async () => {}
  };
  await persistence.persistOne(observer, db, {
    id: 'terminal-evidence', sessionId: 'run', agentId: 'worker',
    eventType: 'EVIDENCE_REPORT', action: 'VERIFY', detail: 'verified',
    payload: { outcome: 'success' }, severity: 'info'
  });
  assert.equal(writes.length, 1);
  assert.equal(typeof secondary, 'function');
}

run().then(() => console.log('Telemetry evidence persists before workspace side effects.'))
  .catch((error) => { console.error(error); process.exit(1); });

'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisConversation } = require('../src/db/migrations/migrateOntogenesisConversation');
  await migrateOntogenesis(db);
  await migrateOntogenesisConversation(db);
  return db;
}

(async () => {
  const recon = require('../src/services/ontogenesis/reconService');
  const inbox = require('../src/services/ontogenesis/inboxService');

  const db = await memoryDb();

  // Garde read-only : sans source, sans sujet, ou avec écriture → rejet.
  await assert.rejects(recon.submitFinding(db, { projectId: 'p1', kind: 'question', topic: 'x' }), /source-requise/);
  await assert.rejects(recon.submitFinding(db, { projectId: 'p1', source: 'sentinelle', kind: 'preference', topic: 'x' }), /finding-kind-inconnu/);
  await assert.rejects(recon.submitFinding(db, { projectId: 'p1', source: 'sentinelle', kind: 'question', topic: 'x', proposesWrite: true }), /ecriture-interdite/);

  // Trouvaille → mémoire avec provenance + réveil du tick.
  const id = await recon.submitFinding(db, {
    projectId: 'p1', source: 'sentinelle', kind: 'question',
    topic: 'dette-tests', detail: 'couverture en baisse sur le runner', links: ['backend/tests']
  });
  assert.ok(id);
  const events = await inbox.listPendingEvents(db, 'p1');
  assert.ok(events.some((event) => event.type === 'wake'));
  const found = await recon.listReconFindings(db, { projectId: 'p1', source: 'sentinelle', kind: 'question' });
  assert.strictEqual(found.length, 1);
  assert.ok(found[0].content.includes('dette-tests'));
  const other = await recon.listReconFindings(db, { projectId: 'p1', source: 'veille', kind: 'question' });
  assert.strictEqual(other.length, 0);

  console.log('ontogenesis recon checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });

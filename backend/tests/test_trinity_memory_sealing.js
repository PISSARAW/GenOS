'use strict';

// ADR 0280: mission memory sealing. A world must never receive another
// mission's dossier as a souvenir.
const assert = require('node:assert/strict');
const scope = require('../src/services/agentMemoryScope');
const store = require('../src/services/agentMemoryStore');

const N1 = 'Lance Trinity pour analyser cette mission (N1). Un serveur répond habituellement en 120 ms. Le premier appel après plusieurs minutes d\u2019inactivité prend 1,8 s. Le CPU reste sous 20 %.';
const N3 = 'Lance Trinity pour analyser cette mission (N3). Une application devient parfois très lente. Trois explications sont plausibles : contention de verrou, garbage collection, appel réseau externe sous trafic.';
const SCOPE_N1 = { missionId: 'trinity_orch_N1', chamber: 'direct' };

function foreignRecord() {
  return `[VERIFIED_SYSTEM_FACT] Task: ${N3}\nResult: contention de verrou probable.`;
}

function testTagRoundTrip() {
  const content = store.memoryContent({ task: N1, summary: 'ok', options: { missionScope: SCOPE_N1 } }, { raw: [] }, false);
  assert.ok(content.includes('[MISSION_SCOPE id=trinity_orch_N1 chamber=direct]'));
  assert.equal(scope.scopeTagOf(content), 'trinity_orch_N1');
}

function testUntaggedWriteUnchanged() {
  const content = store.memoryContent({ task: N1, summary: 'ok', options: {} }, { raw: [] }, false);
  assert.ok(!content.includes('[MISSION_SCOPE'));
}

function testForeignLongTaskDropped() {
  const kept = scope.filterScoped([{ summary: foreignRecord() }], SCOPE_N1, N1);
  assert.deepEqual(kept, []);
}

function testSameTaskKept() {
  const own = `[VERIFIED_SYSTEM_FACT] Task: ${N1}\nResult: cold start probable.`;
  const kept = scope.filterScoped([{ summary: own }], SCOPE_N1, N1);
  assert.equal(kept.length, 1);
}

function testShortGenericKept() {
  const kept = scope.filterScoped([{ summary: 'Éviter les verrous imbriqués.' }], SCOPE_N1, N1);
  assert.equal(kept.length, 1);
}

function testForeignTagDropped() {
  const tagged = `${foreignRecord()}\n[MISSION_SCOPE id=trinity_orch_N3 chamber=structured]`;
  const kept = scope.filterScoped([{ summary: tagged }], SCOPE_N1, N1);
  assert.deepEqual(kept, []);
}

function testSameTagKept() {
  const tagged = `[VERIFIED_SYSTEM_FACT] Task: ${N1}\nResult: ok.\n[MISSION_SCOPE id=trinity_orch_N1 chamber=direct]`;
  const kept = scope.filterScoped([{ summary: tagged }], SCOPE_N1, N1);
  assert.equal(kept.length, 1);
}

function testNoScopeDropsForeignDossier() {
  const items = [{ summary: foreignRecord() }, { summary: 'court' }];
  const kept = scope.filterScoped(items, null, N1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].summary, 'court');
}

function testNoScopeDropsTagged() {
  const tagged = `${foreignRecord()}\n[MISSION_SCOPE id=trinity_orch_N3 chamber=structured]`;
  const kept = scope.filterScoped([{ summary: tagged }], null, N1);
  assert.deepEqual(kept, []);
}

function testShortTaskPassthrough() {
  const items = [{ summary: foreignRecord() }];
  assert.equal(scope.filterScoped(items, null, 'query courte').length, 1);
}

async function main() {
  testTagRoundTrip();
  testUntaggedWriteUnchanged();
  testForeignLongTaskDropped();
  testSameTaskKept();
  testShortGenericKept();
  testForeignTagDropped();
  testSameTagKept();
  testNoScopeDropsForeignDossier();
  testNoScopeDropsTagged();
  testShortTaskPassthrough();
  console.log('✅ Trinity memory sealing tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });

'use strict';

const fs = require('node:fs');
const { openDatabase } = require('./biologyDatabase');
const authority = require('../../src/services/homeostasisAuthorityStore');

const [mode, filename, missionId, expectedRevision, flag, readyFile, goFile] = process.argv.slice(2);

async function waitForGo() {
  while (!fs.existsSync(goFile)) await new Promise(resolve => setTimeout(resolve, 10));
}

function contract(flagName) {
  return require('../../src/services/homeostasisContractService').buildHomeostasisContract({
    id: `contract-${missionId}`, missionId,
    invariants: [{ id: flagName, kind: 'functional', verifier: { type: 'context.flag', flag: flagName } }]
  });
}

async function resolveContender(db) {
  fs.writeFileSync(readyFile, 'ready');
  await waitForGo();
  try {
    const saved = await authority.resolve(db, { missionId, explicit: true,
      expectedRevision: Number(expectedRevision), proposed: () => contract(flag) });
    return { status: 'saved', revision: saved.revision, flag };
  } catch (error) {
    return { status: 'rejected', code: error.code || null, message: error.message };
  }
}

async function updateAuthority(db) {
  const saved = await authority.resolve(db, { missionId, explicit: true,
    expectedRevision: Number(expectedRevision), proposed: () => contract(flag) });
  return { status: 'saved', revision: saved.revision };
}

async function inspectRestart(db) {
  const active = await authority.active(db, missionId);
  let staleClosure = null;
  if (active && active.revision > Number(expectedRevision)) {
    try {
      await require('../../src/services/homeostasisClosureService').assertClosure(db, missionId);
      staleClosure = { status: 'accepted' };
    } catch (error) {
      staleClosure = { status: 'rejected', code: error.code || null };
    }
  }
  return { revision: active?.revision || null, contractHash: active?.contractHash || null, staleClosure };
}

async function main() {
  const db = openDatabase(filename);
  try {
    await db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 30000;');
    const result = mode === 'resolve' ? await resolveContender(db)
      : mode === 'update' ? await updateAuthority(db) : await inspectRestart(db);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

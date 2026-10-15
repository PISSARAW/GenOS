'use strict';

const fs = require('node:fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const migrate = require('../../src/db/migrations/migrateRuntimeControlReconnectAuthorities');
const storeFactory = require('../../src/services/runtimeControlAuthorityStore');
const recovery = require('../../src/services/runtimeControlRecoveryBootstrap');
const { activeProcesses } = require('../../src/services/agentOrchestrationState');

const input = JSON.parse(Buffer.from(process.env.GENOS_RECOVERED_BACKEND, 'base64url').toString());
let db;
let store;
let record;
let channel;
let supervisor;

function reply(message) { process.send?.(message); }

async function start() {
  db = await open({ filename: input.database, driver: sqlite3.Database });
  await migrate.migrateRuntimeControlReconnectAuthorities(db);
  store = storeFactory.create(db);
  if (input.descriptor) record = await store.saveReconnectAuthority({ descriptor: input.descriptor });
  const results = await recovery.recover({ store,
    backendPrivateKey: fs.readFileSync(input.privateKey, 'utf8') });
  const proof = results.find(result => result.proven);
  if (!proof) throw new Error(`Recovery failed: ${JSON.stringify(results)}`);
  const records = await store.listReconnectAuthorities();
  record = records[0];
  channel = activeProcesses.get(input.lineage.workerId);
  supervisor = channel.genosRecoveredSupervisor;
  if (!supervisor) throw new Error('Recovered supervisor was not attached by reassociation.');
  for (const kind of ['event', 'stdout', 'stderr', 'terminal', 'lost']) {
    supervisor.events.on(kind, payload => reply({ type: 'supervision', kind, payload }));
  }
  supervisor.events.on('protocolError', error => reply({ type: 'protocol-error', code: error.code }));
  reply({ type: 'recovered', proof, capabilities: supervisor.capabilities,
    hasChildStreams: 'stdout' in supervisor || 'stderr' in supervisor || 'kill' in supervisor });
  process.on('message', message => { if (message?.type === 'revoke') void revoke(); });
}

async function revoke() {
  const revoked = await store.revokeReconnectAuthority({ id: record.id,
    expectedRevision: record.revision, lineage: input.lineage, reason: 'runtime-terminal' });
  supervisor.close();
  channel.destroy();
  activeProcesses.delete(input.lineage.workerId);
  reply({ type: 'revoked', status: revoked.status,
    remaining: (await store.listReconnectAuthorities()).length });
  await db.close();
  process.exit(0);
}

void start().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

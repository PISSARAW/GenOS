'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-omega-recovery-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fork } = require('node:child_process');
const Database = require('better-sqlite3');
const fixture = require('./helpers/missionProtocolFixture');

function child(filename, mode) {
  const process = fork(path.join(__dirname, 'helpers/missionOmegaProcess.cjs'), [filename, mode], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mission OMEGA recovery process timeout.')), 20000);
    process.on('message', value => { clearTimeout(timeout); value.error ? reject(new Error(value.error)) : resolve(value); });
    process.once('error', reject);
    process.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Mission OMEGA child exited ${code}`)); });
  });
  return { process, response, stop: () => new Promise(resolve => { process.once('exit', resolve); process.kill(); }) };
}

async function main() {
  const ctx = await fixture.create();
  let current;
  try {
    const binding = await fixture.seal(ctx);
    const database = (await ctx.db.all('PRAGMA database_list')).find(value => value.name === 'main').file;
    const filename = path.join(ctx.root, 'child.json');
    await fs.writeFile(filename, JSON.stringify({ database, graph: { id: 'recoverable-output', domain: 'runtime',
      objectStore: { source: { value: 7 } }, operations: [
        { id: 'read', kind: 'READ', reference: 'source', dependsOn: [] },
        { id: 'select', kind: 'SELECT', reference: 'value', dependsOn: ['read'] },
        { id: 'check', kind: 'CHECK', reference: 'seven', dependsOn: ['select'] },
        { id: 'emit', kind: 'EMIT', reference: 'mission.result', dependsOn: ['check'] }] },
    context: { executionRunId: ctx.executionRun.id, agentId: ctx.agentId, missionId: ctx.normalizedMission.missionId,
      routeActionId: 'recoverable-action', prompt: 'recover output' } }));
    current = child(filename, 'crash-gap');
    assert.equal((await current.response).effectCommitted, true);
    await current.stop(); current = null;
    current = child(filename, 'resume');
    const response = await current.response;
    assert.equal(response.completed, true); assert.deepEqual(response.output.result, { value: 7 });
    await current.stop(); current = null;
    const resource = new Database(path.join(binding.directory, 'omega-resource.sqlite'), { readonly: true });
    try {
      assert.equal(resource.prepare('SELECT COUNT(*) AS count FROM omega_resource_effects').get().count, 1);
      assert.equal(JSON.parse(resource.prepare('SELECT authority FROM omega_resource_authority').get().authority).budget.spent, 1);
    } finally { resource.close(); }
    console.log('Mission OMEGA real process crash after native effect commit reconciles and resumes without duplicate: PASS');
  } finally { if (current) await current.stop(); await ctx.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

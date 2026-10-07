import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const sqlite3 = require('../backend/node_modules/sqlite3');
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-signal-'));
const database = path.join(temporary, 'signal.db');
const client = new Client({ name: 'signal-persistence-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env,
    GENOS_MCP_LEASE: 'genos_signal_publish,genos_signal_purge,genos_signal_electrocyte_vote',
    GENOS_DB_PATH: database, GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test' } });
transport.stderr.on('data', () => {});

function output(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, (error) => error ? reject(error) : resolve()));
}

try {
  await client.connect(transport);
  const published = output(await client.callTool({ name: 'genos_signal_publish', arguments: {
    signal_type: 'ligand', signal_data: { semanticType: 'TEST_PERSISTED', concentration: 0.4 },
    topic: 'mcp-persistence' } }));
  assert.equal(published.published, true);
  const db = new sqlite3.Database(database, sqlite3.OPEN_READWRITE);
  try {
    const row = await get(db, 'SELECT signal_type, topic FROM signal_blobs WHERE signal_id = ?', [published.signalId]);
    assert.equal(row.signal_type, 'ligand');
    assert.equal(row.topic, 'mcp-persistence');

    const vote = output(await client.callTool({ name: 'genos_signal_electrocyte_vote', arguments: {
      topic: 'mcp-vote', discharges: [{ agentId: 'a', voltageMv: 180, phaseAngle: 0 },
        { agentId: 'b', voltageMv: 180, phaseAngle: 0 }], threshold_mv: 300 } }));
    assert.equal(vote.status, 'electrocyte_decision');
    assert.equal(vote.participantCount, 2);
    assert.equal(vote.consensusReached, true);
    const voltage = await get(db, "SELECT COUNT(*) AS count FROM signal_blobs WHERE signal_type = 'voltage' AND topic = 'mcp-vote'");
    assert.equal(voltage.count, 1, 'vote must persist its voltage signal');

    await run(db, "UPDATE signal_blobs SET expires_at = datetime('now', '-1 day') WHERE signal_id = ?", [published.signalId]);
    output(await client.callTool({ name: 'genos_signal_purge', arguments: {} }));
    assert.equal(await get(db, 'SELECT signal_id FROM signal_blobs WHERE signal_id = ?', [published.signalId]), undefined);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
  console.log('Signal publish, electrocyte vote, and expiry purge persisted through MCP stdio.');
} finally {
  await client.close();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}

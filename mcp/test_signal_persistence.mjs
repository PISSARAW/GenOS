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
    GENOS_MCP_LEASE: 'genos_signal_publish,genos_signal_read,genos_signal_ground,genos_signal_purge,genos_signal_electrocyte_vote,genos_signal_chemotactic_follow,genos_signal_collective_decision',
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

    await run(db, "INSERT INTO organizations (id, name) VALUES ('mcp-org', 'MCP Test Org')");
    await run(db, "INSERT INTO projects (id, organization_id, name) VALUES ('mcp-project', 'mcp-org', 'MCP Project')");
    await run(db, "INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('mcp-workspace', 'MCP Workspace', 'fixture', 'mcp-org', 'mcp-project')");
    for (const agentId of ['mcp-sender', 'mcp-reader']) {
      await run(db, 'INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
        [agentId, agentId, 'tester', 'idle', 'orchestrator', 'mcp-workspace']);
    }
    const scoped = output(await client.callTool({ name: 'genos_signal_publish', arguments: {
      signal_type: 'ligand', signal_data: { semanticType: 'SCOPED_TEST', concentration: 0.5 },
      orchestrator_id: 'mcp-sender' } }));
    assert.equal(scoped.published, true);
    const firstRead = output(await client.callTool({ name: 'genos_signal_read', arguments: { agent_id: 'mcp-reader' } }));
    assert.equal(firstRead.count, 1);
    assert.equal(firstRead.signals[0].signalId, scoped.signalId);
    assert.equal(firstRead.signals[0].integrity.status, 'verified');
    const delivery = await get(db, 'SELECT status FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?',
      [scoped.signalId, 'mcp-reader']);
    assert.equal(delivery.status, 'seen');
    const secondRead = output(await client.callTool({ name: 'genos_signal_read', arguments: { agent_id: 'mcp-reader' } }));
    assert.equal(secondRead.count, 0, 'a seen signal must not be replayed');
    const grounded = output(await client.callTool({ name: 'genos_signal_ground', arguments: {
      signal_id: scoped.signalId, agent_id: 'mcp-reader', grounding_level: 'transport_ack' } }));
    assert.equal(grounded.status, 'grounding_recorded');
    const groundRow = await get(db, 'SELECT grounding_level FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?',
      [scoped.signalId, 'mcp-reader']);
    assert.equal(groundRow.grounding_level, 'transport_ack');

    const vote = output(await client.callTool({ name: 'genos_signal_electrocyte_vote', arguments: {
      topic: 'mcp-vote', discharges: [{ agentId: 'a', voltageMv: 180, phaseAngle: 0 },
        { agentId: 'b', voltageMv: 180, phaseAngle: 0 }], threshold_mv: 300 } }));
    assert.equal(vote.status, 'electrocyte_decision');
    assert.equal(vote.participantCount, 2);
    assert.equal(vote.consensusReached, true);
    const suppressedVote = await client.callTool({ name: 'genos_signal_electrocyte_vote', arguments: {
      topic: 'mcp-vote', discharges: [{ agentId: 'a', voltageMv: 180, phaseAngle: 0 }], threshold_mv: 300 } });
    assert.equal(suppressedVote.isError, true, 'a coalesced vote must not claim publication');
    assert.match(suppressedVote.content[0].text, /not published/i);
    const voltage = await get(db, "SELECT COUNT(*) AS count FROM signal_blobs WHERE signal_type = 'voltage' AND topic = 'mcp-vote'");
    assert.equal(voltage.count, 1, 'vote must persist its voltage signal');

    const trail = output(await client.callTool({ name: 'genos_signal_publish', arguments: {
      signal_type: 'pheromone', signal_data: { intensity: 0.6 }, topic: 'mcp-gradient' } }));
    assert.equal(trail.published, true);
    const gradient = output(await client.callTool({ name: 'genos_signal_chemotactic_follow', arguments: {
      agent_id: 'mcp-reader', locus_hash: 'mcp-gradient' } }));
    assert.equal(gradient.status, 'chemotactic_gradient');
    assert.equal(gradient.signalsRead, 1);
    assert.equal(gradient.netGradient, 0.6);

    const collective = output(await client.callTool({ name: 'genos_signal_collective_decision', arguments: {
      problem: 'mcp-choice', mode: 'electrocyte', voters: [{ agentId: 'a', position: 2, weight: 0 },
        { agentId: 'b', position: 2, weight: 0 }] } }));
    assert.equal(collective.status, 'electrocyte_decision');
    assert.equal(collective.consensusReached, true);
    const suppressedCollective = await client.callTool({ name: 'genos_signal_collective_decision', arguments: {
      problem: 'mcp-choice', mode: 'electrocyte', voters: [{ agentId: 'a', position: 2, weight: 0 }] } });
    assert.equal(suppressedCollective.isError, true, 'a coalesced collective vote must not claim publication');
    assert.match(suppressedCollective.content[0].text, /not published/i);
    const collectiveSignal = await get(db,
      "SELECT COUNT(*) AS count FROM signal_blobs WHERE signal_type = 'voltage' AND topic = 'dec_mcp-choice'");
    assert.equal(collectiveSignal.count, 1);

    await run(db, "UPDATE signal_blobs SET expires_at = datetime('now', '-1 day') WHERE signal_id = ?", [published.signalId]);
    output(await client.callTool({ name: 'genos_signal_purge', arguments: {} }));
    assert.equal(await get(db, 'SELECT signal_id FROM signal_blobs WHERE signal_id = ?', [published.signalId]), undefined);
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
  console.log('Signal transport, grounding, votes, gradient, and expiry purge verified through MCP stdio.');
} finally {
  await client.close();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}

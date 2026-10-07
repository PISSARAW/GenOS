'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = require('./helpers/b06ClientFixture.cjs');
const inspection = require('../src/services/consumerInspectionService');

async function request(spec, endpoint, settings = {}) {
  const response = await fetch(`${spec.url}${endpoint}`, { method: settings.body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${spec.token}`, 'X-Organization-Id': 'b06-org',
      'X-Project-Id': settings.project || 'b06-project', 'Content-Type': 'application/json' },
    body: settings.body ? JSON.stringify(settings.body) : undefined });
  return { status: response.status, body: await response.json() };
}

async function assertIntegrity(spec, context) {
  const parent = await spec.db.get("SELECT * FROM provenance_records WHERE subject_type = 'strategy_promotion'");
  await spec.db.run('UPDATE provenance_records SET payload_json = ? WHERE id = ?', '{}', parent.id);
  await assert.rejects(inspection.inspect(spec.db, context), /CONSUMER_PROVENANCE_INTEGRITY/);
  await spec.db.run('UPDATE provenance_records SET payload_json = ? WHERE id = ?', parent.payload_json, parent.id);
  const assemblyId = JSON.parse(parent.payload_json).assemblyId;
  const assembly = await spec.db.get('SELECT signature FROM aeis_assurance_assemblies WHERE id = ?', assemblyId);
  await spec.db.run('UPDATE aeis_assurance_assemblies SET signature = ? WHERE id = ?', 'invalid', assemblyId);
  await assert.rejects(inspection.inspect(spec.db, context), /AEIS assembly integrity failure/);
  await spec.db.run('UPDATE aeis_assurance_assemblies SET signature = ? WHERE id = ?', assembly.signature, assemblyId);
  const journal = await spec.db.get('SELECT signature FROM promotion_execution_journal WHERE run_id = ?', spec.run.id);
  await spec.db.run('UPDATE promotion_execution_journal SET signature = ? WHERE run_id = ?', 'invalid', spec.run.id);
  await assert.rejects(inspection.inspect(spec.db, context), /PROMOTION_JOURNAL_INTEGRITY/);
  await spec.db.run('UPDATE promotion_execution_journal SET signature = ? WHERE run_id = ?', journal.signature, spec.run.id);
}

async function main() {
  assert.equal(inspection.escapeLikePattern('%_\\'), '\\%\\_\\\\');
  const spec = await fixture.prepare();
  const server = require('../src/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  spec.url = `http://127.0.0.1:${server.address().port}`;
  try {
    const endpoint = `/api/product-proofs/consumer-runs/${spec.run.id}`;
    assert.equal((await fetch(`${spec.url}${endpoint}`)).status, 401);
    assert.equal((await request(spec, endpoint, { project: 'b06-other' })).status, 404);
    const pending = await request(spec, endpoint);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.run.status, 'awaiting_approval');
    assert.equal(pending.body.promotion, null);
    assert.equal(pending.body.executionAuthority.status, 'legacy_unbound');
    assert.equal(pending.body.executionAuthority.postconditions, 'not_evaluated');
    assert.deepEqual(pending.body.provenance, []);
    assert.equal((await request(spec, '/api/missions/b06/resources/tool/key')).status, 403);
    assert.equal((await request(spec, '/api/missions/b06/wake', { body: {} })).status, 403);
    const missing = await request(spec, `/api/execution-runs/${spec.run.id}/approve`, { body: {} });
    assert.equal(missing.status, 403);
    const completed = await request(spec, `/api/execution-runs/${spec.run.id}/approve`, { body: fixture.approval(spec) });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    const context = { runId: spec.run.id, scope: { organizationId: 'b06-org', projectId: 'b06-project' } };
    const view = await inspection.inspect(spec.db, context);
    assert.equal(view.promotion.phase, 'completed');
    assert.equal(view.provenance[0].assemblyAccepted, true);
    assert.equal(view.provenance[0].memories[0].agentId, 'consumer-promotion-agent');
    assert.equal((await request(spec, '/api/product-proofs/consumer-agents/consumer-promotion-agent/latest')).body.run.id, spec.run.id);
    const listed = await request(spec, '/api/product-proofs/consumer-agents/consumer-promotion-agent/runs?q=completed&status=completed');
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.runs.map(run => run.id), [spec.run.id]);
    assert.equal(listed.body.hasMore, false);
    assert.equal(listed.body.nextOffset, null);
    const invalidStatus = await request(spec, '/api/product-proofs/consumer-agents/consumer-promotion-agent/runs?status=not-a-status');
    assert.equal(invalidStatus.status, 400);
    assert.equal(invalidStatus.body.error.code, 'INVALID_RUN_STATUS');
    await assertIntegrity(spec, context);
    await require('./helpers/assemblyRetractionHttpProbes').qualify(spec, request);
    console.log('Consumer inspection: tenant isolation, real promotion provenance, tamper refusal and mission admin boundaries passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-omega-fixture-only';
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const fixture = require('./helpers/missionProtocolFixture');
const router = require('../src/services/cognitiveOmegaRouterExecution');

function input(ctx, value = 7) {
  return { graph: { id: 'checked-mission-output', domain: 'runtime', objectStore: { source: { value } },
    operations: [{ id: 'read', kind: 'READ', reference: 'source', dependsOn: [] },
      { id: 'select', kind: 'SELECT', reference: 'value', dependsOn: ['read'] },
      { id: 'check', kind: 'CHECK', reference: 'seven', dependsOn: ['select'] },
      { id: 'emit', kind: 'EMIT', reference: 'mission.result', dependsOn: ['check'] }] },
  context: { db: ctx.db, executionRunId: ctx.executionRun.id, agentId: ctx.agentId,
    missionId: ctx.normalizedMission.missionId, routeActionId: 'checked-output', prompt: 'check and store candidate' },
  candidates: [], mode: 'fallback', options: { cognitiveNativeHandlers: {
    selectors: { value: ({ input: candidate }) => ({ value: candidate.value }) },
    verifiers: { seven: ({ candidate }) => ({ status: candidate.value === 7 ? 'verified' : 'refuted',
      valid: candidate.value === 7, predicate: 'value-equals-seven' }) } } } };
}

async function realAdmissionExecutionAndEffect() {
  const ctx = await fixture.create();
  try {
    const binding = await fixture.seal(ctx);
    const request = input(ctx);
    const output = await router.executeNativeGraph(request);
    assert.equal(output.protocol.name, 'OMEGA');
    assert.deepEqual(output.result, { value: 7 });
    assert.deepEqual(output.execution.operations.map(value => value.status), ['ready', 'ready', 'verified', 'emitted']);
    assert.deepEqual(await router.executeNativeGraph(request), output);
    const resource = new Database(path.join(binding.directory, 'omega-resource.sqlite'), { readonly: true });
    try {
      assert.equal(resource.prepare('SELECT COUNT(*) AS count FROM omega_resource_effects').get().count, 1);
      assert.deepEqual(JSON.parse(resource.prepare('SELECT value FROM omega_resource_values').get().value), { value: 7 });
      const authority = JSON.parse(resource.prepare('SELECT authority FROM omega_resource_authority').get().authority);
      assert.equal(authority.budget.spent, 1);
    } finally { resource.close(); }
    const receipts = await ctx.db.all("SELECT * FROM mission_protocol_receipts WHERE protocol='OMEGA'");
    assert.equal(receipts.length, 1);
    assert.equal(JSON.parse(receipts[0].receipt_json).result.status, 'completed');
  } finally { await ctx.close(); }
}

async function failedPredicateHasNoEffect() {
  const ctx = await fixture.create();
  try {
    const binding = await fixture.seal(ctx);
    await assert.rejects(router.executeNativeGraph(input(ctx, 8)), error => error.code === 'OMEGA_NATIVE_GRAPH_BLOCKED');
    const resource = new Database(path.join(binding.directory, 'omega-resource.sqlite'), { readonly: true });
    try { assert.equal(resource.prepare('SELECT COUNT(*) AS count FROM omega_resource_effects').get().count, 0); }
    finally { resource.close(); }
  } finally { await ctx.close(); }
}

async function actorAndMissingEndpointRefused() {
  const ctx = await fixture.create();
  try {
    await fixture.seal(ctx);
    const swapped = input(ctx); swapped.context.agentId = 'foreign-agent';
    await assert.rejects(router.executeNativeGraph(swapped), /ACTOR_OR_MISSION_MISMATCH/);
    const external = input(ctx);
    external.graph.operations[3].reference = 'deploy.production';
    await assert.rejects(router.executeNativeGraph(external), /EMITTER_NOT_INSTALLED/);
    const call = input(ctx); call.graph.operations[3].kind = 'CALL';
    await assert.rejects(router.executeNativeGraph(call), /DURABLE_CALL_ENDPOINT_REQUIRED/);
    await require('../src/services/missionExecutionAuthority').rotate(ctx.db, {
      missionId: ctx.normalizedMission.missionId, agentId: 'parent', forceRotate: true });
    await assert.rejects(router.executeNativeGraph(input(ctx)), /MISSION_AUTHORITY_STALE/);
  } finally { await ctx.close(); }
}

async function originalPolicyStillConstrains() {
  const ctx = await fixture.create();
  try {
    const binding = await fixture.seal(ctx);
    const blockedRead = input(ctx);
    let reads = 0;
    blockedRead.options.cognitiveNativeHandlers.readers = { source: () => { reads += 1; return { value: 7 }; } };
    blockedRead.options.cognitivePolicy = { read: [] };
    await assert.rejects(router.executeNativeGraph(blockedRead), /policy permission/);
    assert.equal(reads, 0);
    const blockedEmit = input(ctx); blockedEmit.options.cognitiveAllowEmit = false;
    await assert.rejects(router.executeNativeGraph(blockedEmit), /EMIT_POLICY_DENIED/);
    const economy = input(ctx); economy.economy = { execution: { allowEmit: false } };
    await assert.rejects(router.executeNativeGraph(economy), /EMIT_ECONOMY_DENIED/);
    const downgraded = input(ctx); delete downgraded.context.executionRunId;
    await assert.rejects(router.executeNativeGraph(downgraded), /RUN_ID_REQUIRED/);
    const resource = new Database(path.join(binding.directory, 'omega-resource.sqlite'), { readonly: true });
    try { assert.equal(resource.prepare('SELECT COUNT(*) AS count FROM omega_resource_effects').get().count, 0); }
    finally { resource.close(); }
  } finally { await ctx.close(); }
}

async function main() {
  await realAdmissionExecutionAndEffect();
  await failedPredicateHasNoEffect();
  await actorAndMissingEndpointRefused();
  await originalPolicyStillConstrains();
  console.log('Mission OMEGA real admission/execution, durable checked output and authority refusal: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

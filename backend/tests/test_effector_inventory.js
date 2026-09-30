'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../../shared/effectorRegistry.json');
const { recordToolEfference, toolOutcomePayload } = require('../src/services/mcpExecutor');
const { discharge } = require('../src/services/efferenceCopyService');

function memoryDb() {
  const rows = new Map();
  return {
    get: async (sql, scope, key) => rows.has(`${scope}|${key}`)
      ? { payload_json: rows.get(`${scope}|${key}`) } : null,
    all: async () => [],
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (scope && !String(sql).includes('adaptive_state_events')) rows.set(`${scope}|${key}`, payload);
    }
  };
}

function verifyRegistry() {
  const ids = registry.effectors.map((effector) => effector.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const effector of registry.effectors) {
    assert.ok(effector.sourceRefs.length > 0, `${effector.id} needs a source reference`);
    for (const source of effector.sourceRefs) assert.ok(fs.existsSync(path.join(__dirname, '..', '..', source)), source);
  }
  assert.ok(registry.effectors.some((effector) => effector.status === 'uncovered'));
}

async function verifyMcpCorrelation() {
  const db = memoryDb();
  const context = { db, agentId: 'inventory-test', toolName: 'genos_snapshot', actionId: 'mcp-action-42' };
  await recordToolEfference(context);
  const payload = toolOutcomePayload({ ...context, sourceActionId: context.actionId }, { status: 'ok' });
  const event = await discharge(db, context.agentId, { eventType: 'WORKFLOW_MCP_TOOL_COMPLETED', payload });
  assert.equal(event.matched, true);
  assert.equal(event.strength, 1);
  assert.equal((await discharge(db, context.agentId, { eventType: 'WORKFLOW_MCP_TOOL_COMPLETED', payload })).matched, false);
}

verifyRegistry();
verifyMcpCorrelation().then(() => console.log('✅ effector inventory and MCP correlation passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const controlDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'axolotl-control-'));
process.env.GENOS_DB_PATH = path.join(controlDirectory, 'control.sqlite');
process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
const adapter = require('../src/services/strategyExecutionAdapter');
const service = require('../src/services/axolotlRegenerationService');
const store = require('../src/services/axolotlStateStore');
const { getStrategy } = require('../src/strategies/strategyRegistry');
const { composeMode } = require('../src/services/biologicalTopologyService');
const { fixture, planInput } = require('./axolotlTestHarness');
async function main() {
  const test = await fixture();
  const db = test.db;
  try {
    const context = { ...planInput(db), failureContext: { structural: true, componentIds: ['damaged'] },
      cognitiveScope: ['rule'], cognitiveSourceRefs: [{ memoryId: 'source', key: 'rule' }] };
    context.currentTopology.knowledge.rule = 'broken';
    const strategy = getStrategy('axolotl_regeneration');
    for (const primitive of strategy.primitives) {
      const result = await adapter.executePrimitive(primitive, context);
      assert.equal(result.success, true, primitive + ': ' + JSON.stringify(result));
    }
    const firstId = context.sessionId;
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM learned_traits')).count, 1);
    assert.equal((await adapter.executePrimitive('axolotl_recall', { db, orchestratorId: 'parent', key: 'rule' })).result, 'safe');
    const route = await adapter.executePrimitive('axolotl_route', { db, orchestratorId: 'parent', from: 'input', to: 'memory', payload: { task: 1 } });
    assert.equal(route.queued, true);
    const inbox = await adapter.executePrimitive('axolotl_inbox', { db, orchestratorId: 'parent', componentId: 'memory' });
    assert.deepEqual(inbox.messages[0].payload, { task: 1 });
    assert.equal((await adapter.executePrimitive('axolotl_inbox', { db, orchestratorId: 'parent', componentId: 'memory' })).messages.length, 0);
    const composition = await composeMode({ db, orchestratorId: 'parent', mission: context.mission, mode: 'axolotl' });
    assert.equal(composition.runtimeStatus, 'adopted');
    assert.equal(composition.members.length, context.topology.components.length);
    for (const scope of [{ type: 'global' }, { type: 'roles', roles: ['processing'] }]) {
      const active = await store.activeTopology(db, 'parent');
      const plan = await service.planRegeneration({ ...planInput(db), currentTopology: active.topology, scope });
      const result = await service.executeRegeneration({ db, sessionId: plan.sessionId, context: { orchestratorId: 'parent' } });
      assert.equal(result.success, true);
    }
    await assert.rejects(service.rollbackRegeneration({ db, sessionId: firstId, orchestratorId: 'parent' }), { code: 'AXOLOTL_ROLLBACK_CONFLICT' });
    await db.run("UPDATE agents SET workspace_id = 'changed' WHERE id = 'parent'");
    assert.equal((await adapter.executePrimitive('axolotl_recall', { db, orchestratorId: 'parent', key: 'rule' })).code, 'AXOLOTL_WORKSPACE_CHANGED');
    console.log('Axolotl complete strategy dispatch, runtime routing, composition and repeated regeneration: passed');
  } finally { await db.close(); await test.cleanup(); await require('../src/db').closeDatabase(); fs.rmSync(controlDirectory, { recursive: true, force: true }); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });

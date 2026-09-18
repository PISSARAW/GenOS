'use strict';

const assert = require('node:assert/strict');
const { HANDLERS } = require('../src/services/primitiveHandlers/handlersRegistry');

async function main() {
  const rows = new Map();
  const db = {
    run: async (sql, ...args) => {
      if (sql.includes('INSERT OR REPLACE')) rows.set(args[0], { id: args[0], metadata_json: args[5] });
      if (sql.includes('UPDATE')) rows.get(args[1]).metadata_json = args[0];
    }
  };
  const context = {
    db,
    agentId: 'agent-cognitive',
    experiences: [{ id: 'exp-1', outcome: 'success', evidence: [{ source: 'test' }] }],
    relations: [{ sourceId: 'exp-1', targetId: 'strategy-a', type: 'strategy_success', strength: 0.8 }]
  };
  const packet = await HANDLERS.experience_packets(context);
  assert.equal(packet.success, true);
  const graph = await HANDLERS.knowledge_graph(context);
  assert.equal(graph.success, true);
  assert.equal(graph.status, 'pending_review');
  const blocked = await HANDLERS.reviewed_apply(context);
  assert.equal(blocked.code, 'REVIEW_REQUIRED');
  const applied = await HANDLERS.reviewed_apply({ ...context, review: 'approved' });
  assert.equal(applied.success, true);
  assert.equal(applied.applied, 1);
  assert.match([...rows.values()][0].metadata_json, /approved/);
}

main().then(() => console.log('Cognitive merge primitives passed.'));

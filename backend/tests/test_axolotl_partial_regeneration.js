'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/axolotlRegenerationService');

async function main() {
  const currentTopology = { structure: 'centralized', components: [
    { id: 'damaged', role: 'processing' }, { id: 'healthy', role: 'memory' }
  ], connections: [{ from: 'damaged', to: 'healthy', type: 'route' }] };
  const plan = await service.planRegeneration({ mission: 'route requests', reason: 'damaged processor', currentTopology, scope: { type: 'components', componentIds: ['damaged'] } });
  const result = await service.executeRegeneration({ sessionId: plan.sessionId });
  assert.equal(result.newTopology.components.some((component) => component.id === 'healthy'), true);
  assert.equal(result.newTopology.scope.type, 'components');
  assert.ok(result.cost.durationMs >= 0);
  assert.ok(result.cost.componentsChanged > 0);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

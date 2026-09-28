import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const biome = require('../../backend/src/services/biomeCoordinationService.js');
const { runBiomeMission } = require('../../backend/src/services/biome/biomeMissionLoop.js');

const session = await biome.composeBiome('demo boucle biome', { organization: 'energy_huddle' });
console.log('session', session.sessionId);

const base = { budget: 100, capabilities: ['forage', 'allocate'], proposal: { patchHistory: [], cost: 10 }, action: { populations: [] }, observations: [] };
console.log('completed', (await runBiomeMission(session.sessionId, { ...base, adapter: 'simulated' }, {})).status);
console.log('abstention-budget', (await runBiomeMission(session.sessionId, { ...base, proposal: { cost: 9999 } }, {})).status);
console.log('abstention-autorisation', (await runBiomeMission(session.sessionId, { ...base, adapter: 'real' }, { authorize: () => false })).status);
console.log('echec-budget', (await runBiomeMission(session.sessionId, { ...base, budget: -5 }, {})).status);
console.log('reprise', (await runBiomeMission(session.sessionId, { ...base, adapter: 'simulated' }, {})).status);

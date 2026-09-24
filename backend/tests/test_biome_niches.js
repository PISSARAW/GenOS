const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const compatibility = require('../src/services/biome/niches/nicheCompatibilityService');

async function run() {
  const session = await biome.composeBiome('Find and verify a regression.', {
    environment: {
      opportunities: [
        { id: 'logs', descriptor: 'Inspect runtime logs', opportunityScore: 0.8, evidenceRefs: ['artifact:logs'], requiredCapabilities: ['log-analysis'] },
        { id: 'guess', descriptor: 'Unverified hunch', opportunityScore: 0.9 }
      ]
    }
  });
  const discovery = await biome.discoverSessionNiches(session.sessionId, [
    { clusterId: 'one', occurrences: 1, evidenceRefs: ['error:one'] },
    { clusterId: 'two', occurrences: 3, descriptor: 'Repeated timeout failures', evidenceRefs: ['error:two-a', 'error:two-b'], signalIds: ['timeout-a', 'timeout-b'] }
  ]);
  assert.equal(discovery.candidates.length, 2);
  assert.ok(discovery.candidates.every((niche) => niche.status === 'candidate'));
  assert.ok(discovery.candidates.every((niche) => niche.evidenceRefs.length > 0));

  const opened = await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-logs', options: { minimumOpportunityScore: 0.5 } });
  assert.equal(opened.niche.status, 'open');
  const colonized = await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-logs', measurements: { occupancy: 1, carryingCapacity: 2 } });
  assert.equal(colonized.niche.status, 'colonized');
  const saturated = await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-logs', measurements: { occupancy: 2, carryingCapacity: 2 } });
  assert.equal(saturated.niche.status, 'saturated');

  const snapshot = await biome.sessionSnapshot(session.sessionId);
  assert.equal(snapshot.niches.length, 2);
  assert.equal(snapshot.niches.find((niche) => niche.nicheId === 'niche-logs').status, 'saturated');
  assert.deepEqual(compatibility.assessCompatibility({ requiredCapabilities: ['sql', 'python'], capabilities: ['python'] }), {
    compatible: false, matchedCapabilities: 1, missingCapabilities: ['sql'], fit: 0.5
  });
  await assert.rejects(() => biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'unknown' }), { code: 'BIOME_NICHE_UNKNOWN' });
  console.log('Biome niche checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

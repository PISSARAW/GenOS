'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_TOOL_MEMBRANE_HMAC_SECRET ||= 'studio-inspection-http-secret-32-bytes';
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const episodes = require('../src/services/missionEpisodeService');
const threads = require('../src/services/cellThreadService');
const ledger = require('../src/services/metabolicLedgerService');
const membrane = require('../src/services/toolPermissionMembraneService');

const SCOPE = { organizationId: 'b06-org', projectId: 'b06-project' };

async function seed(spec) {
  await spec.db.run(`INSERT INTO missions (mission_id, objective, status)
    VALUES ('mission-http-inspection', 'Inspect over HTTP', 'active')`);
  await episodes.create(spec.db, { ...SCOPE, missionId: 'mission-http-inspection',
    episodeId: 'episode-http-inspection', organismRevision: 'organism-http-r1' });
  await threads.create(spec.db, { ...SCOPE, missionId: 'mission-http-inspection',
    episodeId: 'episode-http-inspection', threadId: 'thread-http-root',
    workerId: 'worker-http-root', cellKind: 'orchestrator' });
  await ledger.recordMetabolicObservation(spec.db, { ...SCOPE, id: 'observation-http',
    missionId: 'mission-http-inspection', threadId: 'thread-http-root',
    measurements: { billableTokens: { value: 7, source: 'exact' } } });
  await membrane.authorizeToolCall(spec.db, {
    ...SCOPE, callId: 'permission-http',
    tool: { name: 'genos_replay', version: '1' }, arguments: { snapshot: 'safe' },
    worker: { id: 'worker-http-root', revision: 'worker-http-r1' },
    lease: { id: 'lease-http', tools: ['genos_replay'] },
    policy: { id: 'policy-http', version: '1', decision: 'allow' },
    authorityChecks: [{ source: 'worker-contract', decision: 'allow', deciderId: 'http-test' }]
  });
}

async function main() {
  await withFixture(async spec => {
    await seed(spec);
    const route = '/api/studio/missions/mission-http-inspection/episodes/episode-http-inspection/inspection';
    const ok = await request(spec, `${route}?threadLimit=1&receiptLimit=1`);
    assert.equal(ok.status, 200, JSON.stringify(ok.value));
    assert.equal(ok.value.episode.episodeId, 'episode-http-inspection');
    assert.equal(ok.value.metabolism.metrics.billableTokens.value, 7);
    assert.equal(ok.value.permissionReceipts.items[0].callId, 'permission-http');

    const foreign = await request(spec, route, { project: 'b06-other' });
    assert.equal(foreign.status, 403, JSON.stringify(foreign.value));
    assert.equal(foreign.value.error.code, 'MISSION_EPISODE_SCOPE_DENIED');

    const invalid = await request(spec, `${route}?receiptLimit=101`);
    assert.equal(invalid.status, 400, JSON.stringify(invalid.value));
    assert.equal(invalid.value.error.code, 'MISSION_INSPECTION_PAGINATION_INVALID');

    const post = await request(spec, route, { body: {} });
    assert.equal(post.status, 404, JSON.stringify(post.value));
  });
  console.log('Studio mission inspection HTTP read-only scope checks: PASS');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

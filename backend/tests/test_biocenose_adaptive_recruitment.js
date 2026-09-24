'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const biocenose = require('../src/services/biocenoseService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await biocenose.prepareCommunity({ db, orchestratorId: 'orchestrator', mission: 'Review this change' });
    const result = await biocenose.recruitForDiversityGap({
      db, communityId: community.communityId, actorId: 'orchestrator', candidates: [
        { memberId: 'verify:formal', role: 'verifier', provider: 'proof-provider', capabilities: ['formal proof'] },
        { memberId: 'gen:independent', role: 'generator', provider: 'provider-z', expertise: ['security'] }
      ], roleTargets: { generator: 1, reviewer: 1, verifier: 1 }
    });
    assert.deepEqual(result.recruited.map((member) => member.memberId), ['verify:formal']);
    assert.equal(result.gapsBeforeRecruitment.missingRoles.includes('verifier'), true);
    assert.equal(result.unresolvedRoles.length, 0);
    const restored = await biocenose.prepareCommunity({ db, orchestratorId: 'orchestrator', mission: 'Another community' });
    const noGap = await biocenose.recruitForDiversityGap({
      db, communityId: restored.communityId, actorId: 'orchestrator', candidates: [],
      roleTargets: { generator: 1, reviewer: 1, verifier: 0 }
    });
    assert.equal(noGap.recruited.length, 0);
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose adaptive recruitment checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

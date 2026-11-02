'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const authority = require('../src/services/morphogenesis/morphogenesisProductionAuthority');
const engine = require('../src/services/morphogenesis/transitionEngineService');
const fixture = require('./helpers/missionProtocolsMorphFixture');

async function main() {
  const input = await fixture.create();
  const original = authority.authorize;
  try {
    authority.authorize = async request => {
      const admitted = await original(request);
      await input.db.run('UPDATE agents SET current_task=? WHERE id=?', 'changed after native checkpoint', input.agentId);
      return admitted;
    };
    const refused = await engine.executeTransition({ ...input,
      persistCommit: async () => { throw new Error('source drift must refuse before native effect'); } });
    assert.equal(refused.committed, false);
    assert.match(refused.errors.join(' '), /NATIVE_AGENT_CHANGED/);
    assert.equal(input.collectiveState.agents.get(input.agentId).role, 'orchestrator');
    assert.equal(input.collectiveState.topologyState.organization, 'trinity');
    const folder = path.join(`${input.filename}.protocols`, `morph-${digest([input.req.tenant, input.missionId]).slice(7)}`);
    assert.equal(fs.existsSync(folder), true);
    const db = new Database(path.join(folder, 'coordinator.sqlite'));
    try { assert.equal(db.prepare('SELECT COUNT(*) AS count FROM morph_coordinator_decisions').get().count, 0); }
    finally { db.close(); }
    authority.authorize = original;
    const principalKey = process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
    delete process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
    try {
      const rejected = await engine.executeTransition({ ...input, plan: { ...input.plan, id: 'without-native-authority' },
        persistCommit: async () => { throw new Error('missing signer must not reach native mutation'); } });
      assert.equal(rejected.committed, false);
      assert.match(rejected.errors.join(' '), /Ed25519/);
    } finally { process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = principalKey; }
    console.log('Mission MORPH source drift after real native admission and missing authority refuse before mutation/COMMIT: PASS');
  } finally { authority.authorize = original; await input.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

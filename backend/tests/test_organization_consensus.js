const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const consensus = require('../src/services/organizationConsensusService');

async function run() {
  const dbPath = path.resolve(__dirname, `organization-consensus-test-${process.pid}.db`);
  process.env.GENOS_ADMIN_PASSWORD ||= 'organization-consensus-test-password';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('cons-root-1','R1','orchestrator','running','orchestrator')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('cons-root-2','R2','orchestrator','running','orchestrator')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('cons-w1','W1','implementation','running','worker','cons-root-1')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('cons-w2','W2','implementation','running','worker','cons-root-2')");
    await dynamicOrganization.changeOrganization(db, { orchestratorId: 'cons-root-1', organization: 'quorum_with_abstention', reason: 'test', changedBy: 'cons-root-1' });
    await dynamicOrganization.changeOrganization(db, { orchestratorId: 'cons-root-2', organization: 'quorum_with_abstention', reason: 'test', changedBy: 'cons-root-2' });
    await dynamicOrganization.publish(db, { orchestratorId: 'cons-root-1', senderAgentId: 'cons-w1', kind: 'vote', signalType: 'ligand', signalData: { event: 'aye' }, payload: { support: true, weight: 2 } });
    await dynamicOrganization.publish(db, { orchestratorId: 'cons-root-2', senderAgentId: 'cons-w2', kind: 'vote', signalType: 'ligand', signalData: { event: 'nay' }, payload: { support: false, weight: 3 } });
    const snapshot = await consensus.globalQuorumSnapshot(db, 0.5);
    assert.equal(snapshot.orchestrators, 2);
    assert.equal(snapshot.counted, 2);
    assert.equal(snapshot.snapshots[0].support, 1);
    assert.equal(snapshot.snapshots[0].reached, true);
    assert.equal(snapshot.snapshots[1].support, 0);
    assert.equal(snapshot.snapshots[1].weight, 3);
    assert.equal(snapshot.support, 0.4);
    assert.equal(snapshot.reached, false);
    const loose = await consensus.globalQuorumSnapshot(db, 0.25);
    assert.equal(loose.reached, true);
    assert.deepEqual(consensus.quorumOf([], 0.5), { active: 0, support: 0, abstentions: 0, ratio: 0.5 });
    assert.deepEqual(consensus.quorumOf([{ support: false, weight: 3 }, { abstain: true }], 0.5), { active: 3, support: 0, abstentions: 1, ratio: 0.5 });
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Organization consensus snapshot: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });

const path = require('path');
const repoRoot = path.resolve(__dirname, '../..');
const { getDatabase, closeDatabase } = require(path.join(repoRoot, 'backend/src/db'));
const dynamicOrganization = require(path.join(repoRoot, 'backend/src/services/dynamicOrganizationService'));

async function verify() {
  const db = await getDatabase();
  const targets = [
    'orch-plasmid-1789811865710',
    'orch-plasmid-1789812013363',
    'orch-stigmergy-1789373003151',
    'orch-stigmergy-1789378304741',
    'orch-stigmergy-1789666787723',
    'orch-stigmergy-1789666976415',
    'orch-stigmergy-1789726780236',
    'orch-stigmergy-1789808004951',
    'orch-stigmergy-1789808200413',
    'orch-stigmergy-1789808601419'
  ];
  let total = 0;
  for (const oid of targets) {
    const inbox = await dynamicOrganization.inbox(db, { orchestratorId: oid, requesterAgentId: oid, afterId: 0, limit: 10 });
    const n = Array.isArray(inbox.messages) ? inbox.messages.length : 0;
    total += n;
    console.log(`${oid}: ${n}`);
  }
  console.log(`TOTAL restant: ${total}`);
  await closeDatabase();
}
verify().catch(e => console.error(e.message));

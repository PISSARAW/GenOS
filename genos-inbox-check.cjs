const path = require('path');
// Utilise le module db du backend
const dbModule = require('./backend/src/db');

async function run() {
  const db = await dbModule.getDatabase();
  
  console.log('=== Orchestrateurs actifs ===');
  const orgs = await db.all(
    "SELECT id, name, status, current_task, execution_mode, model_tier FROM agents WHERE execution_mode = 'orchestrator' AND status NOT IN ('apoptosis','completed','terminated','error','failed','unverified','quarantined')"
  );
  console.log(JSON.stringify(orgs, null, 2));
  
  console.log('\n=== Messages inbox (derniers) ===');
  const msgs = await db.all(
    "SELECT id, orchestrator_id, sender_agent_id, kind, channel, project_id, created_at FROM agent_organization_messages ORDER BY id DESC LIMIT 8"
  );
  console.log(JSON.stringify(msgs, null, 2));
  
  console.log('\n=== Compteurs non-lus par orchestrateur ===');
  const counts = await db.all(
    "SELECT orchestrator_id, COUNT(*) as total, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) as unread FROM agent_organization_messages GROUP BY orchestrator_id"
  );
  console.log(JSON.stringify(counts, null, 2));
  
  await db.close();
}

run().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });

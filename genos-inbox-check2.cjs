const dbModule = require('./backend/src/db');

async function run() {
  const db = await dbModule.getDatabase();
  
  console.log('=== 1. Orchestrateurs avec messages inbox (tous, avec compte) ===');
  const rows = await db.all(
    `SELECT m.orchestrator_id, COUNT(*) as count, MAX(m.created_at) as last_msg
     FROM agent_organization_messages m
     JOIN agents a ON a.id = m.orchestrator_id
     WHERE a.execution_mode = 'orchestrator'
       AND a.status NOT IN ('apoptosis','completed','terminated','error','failed','unverified','quarantined')
     GROUP BY m.orchestrator_id
     ORDER BY count DESC, last_msg DESC`
  );
  console.log(JSON.stringify(rows, null, 2));
  
  console.log('\n=== 2. Orchestrateurs "running" avec messages ===');
  const running = await db.all(
    `SELECT m.orchestrator_id, COUNT(*) as count, MAX(m.created_at) as last_msg
     FROM agent_organization_messages m
     JOIN agents a ON a.id = m.orchestrator_id
     WHERE a.execution_mode = 'orchestrator'
       AND a.status = 'running'
     GROUP BY m.orchestrator_id`
  );
  console.log(JSON.stringify(running, null, 2));
  
  console.log('\n=== 3. Total messages inbox global ===');
  const total = await db.get(`SELECT COUNT(*) as cnt FROM agent_organization_messages`);
  console.log(JSON.stringify(total, null, 2));
  
  await db.close();
}

run().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });

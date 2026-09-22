const path = require('path');
const repoRoot = path.resolve(__dirname, '../..');
const { getDatabase, closeDatabase } = require(path.join(repoRoot, 'backend/src/db'));
const dynamicOrganization = require(path.join(repoRoot, 'backend/src/services/dynamicOrganizationService'));
const { spawn } = require('child_process');

async function triageAll() {
  const db = await getDatabase();

  const orchestrators = await fetchOrchestrators(db);
  logOrchestrators(orchestrators);

  const { totalUnread, anyTriaged } = await processOrchestrators(db, orchestrators);

  await closeDatabase();

  logSummary(totalUnread, orchestrators.length);

  if (totalUnread > 0) {
    await runTriageForOrchestrators(orchestrators);
  } else {
    console.log('Tout clair — aucun message inbox pour aucun orchestrateur.');
  }
}

async function fetchOrchestrators(db) {
  const rows = await db.all(
    "SELECT DISTINCT orchestrator_id FROM agent_organization_state ORDER BY orchestrator_id"
  );
  return rows.map(r => r.orchestrator_id);
}

function logOrchestrators(orchestrators) {
  console.log(`Orchestrateurs trouvés (${orchestrators.length}):`);
  orchestrators.forEach(o => console.log(`  - ${o}`));
}

async function processOrchestrators(db, orchestrators) {
  let totalUnread = 0;
  let anyTriaged = false;

  for (const orchestratorId of orchestrators) {
    const requesterAgentId = orchestratorId;
    console.log(`\n--- organization_state :: ${orchestratorId} ---`);

    const state = await getOrganizationState(db, orchestratorId, requesterAgentId);
    if (!state) continue;

    const inbox = await getInbox(db, orchestratorId, requesterAgentId);
    if (!inbox) continue;

    const msgs = Array.isArray(inbox.messages) ? inbox.messages : [];
    logMessages(msgs, orchestratorId);

    if (msgs.length > 0) {
      totalUnread += msgs.length;
      console.log(`  => ${msgs.length} message(s) non lu(s) pour ${orchestratorId}`);
    }
  }

  return { totalUnread, anyTriaged };
}

async function getOrganizationState(db, orchestratorId, requesterAgentId) {
  try {
    const state = await dynamicOrganization.getStateForMember(db, orchestratorId, requesterAgentId);
    console.log(JSON.stringify(state, null, 2));
    return state;
  } catch (e) {
    console.log(`  ERREUR: ${e.message} (code=${e.code || 'N/A'})`);
    return null;
  }
}

async function getInbox(db, orchestratorId, requesterAgentId) {
  try {
    return await dynamicOrganization.inbox(db, {
      orchestratorId,
      requesterAgentId,
      afterId: 0,
      limit: 200
    });
  } catch (e) {
    console.log(`  ERREUR: ${e.message} (code=${e.code || 'N/A'})`);
    return null;
  }
}

function logMessages(msgs, orchestratorId) {
  console.log(`--- worker_inbox :: ${orchestratorId} ---`);
  console.log(`  Messages: ${msgs.length}`);
  msgs.slice(0, 3).forEach((m, i) => {
    console.log(`    [${i}] id=${m.id} sender=${m.sender_agent_id || 'N/A'} kind=${m.kind} channel=${m.channel}`);
  });
}

async function runTriageForOrchestrators(orchestrators) {
  console.log('\nLancement triage worker_inbox_triage pour chaque orchestrateur avec messages...');
  let anyTriaged = false;

  for (const orchestratorId of orchestrators) {
    const triaged = await triageOrchestrator(orchestratorId);
    if (triaged) anyTriaged = true;
  }

  if (!anyTriaged) {
    console.log('Aucun orchestrateur avec messages détecté malgré le comptage — anormal, vérifier.');
  }
}

async function triageOrchestrator(orchestratorId) {
  const db2 = await getDatabase();
  let inbox2;
  try {
    inbox2 = await dynamicOrganization.inbox(db2, {
      orchestratorId,
      requesterAgentId: orchestratorId,
      afterId: 0,
      limit: 1
    });
  } catch(_) { /* ignore */ }
  await closeDatabase();

  const count = Array.isArray(inbox2?.messages) ? inbox2.messages.length : 0;
  if (count > 0) {
    console.log(`  → triage ${orchestratorId} (${count} msg)`);
    const bridge = path.resolve(__dirname, '../../backend/bin/genos-orchestrate.cjs');
    const payload = JSON.stringify({ mission: 'worker_inbox_triage', background: true, orchestratorId });
    const child = spawn(process.execPath, [bridge, payload], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GENOS_STREAM_TELEMETRY: '1' }
    });
    child.stdout.on('data', d => process.stdout.write(`[${orchestratorId}] ${d.toString().trim()}\n`));
    child.stderr.on('data', d => process.stderr.write(`[${orchestratorId}] ${d.toString().trim()}\n`));
    child.on('close', code => console.log(`  [${orchestratorId}] exit=${code}`));
    return true;
  }
  return false;
}

triageAll().catch(e => { console.error(e.stack || e.message); process.exit(1); });

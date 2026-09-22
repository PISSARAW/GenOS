const path = require('path');
const repoRoot = path.resolve(__dirname, '../..');
const { getDatabase, closeDatabase } = require(path.join(repoRoot, 'backend/src/db'));
const dynamicOrganization = require(path.join(repoRoot, 'backend/src/services/dynamicOrganizationService'));
const { spawn } = require('child_process');
const bridge = path.join(repoRoot, 'backend/bin/genos-orchestrate.cjs');

async function triage() {
  const db = await getDatabase();
  const orchestratorId = 'standalone_orchestrator';
  const requesterAgentId = orchestratorId;

  console.log('--- organization_state ---');
  let state;
  try {
    state = await dynamicOrganization.getStateForMember(db, orchestratorId, requesterAgentId);
  } catch (e) {
    state = { error: e.message, code: e.code };
  }
  console.log(JSON.stringify(state, null, 2));

  console.log('--- worker_inbox ---');
  let inbox;
  try {
    inbox = await dynamicOrganization.inbox(db, { orchestratorId, requesterAgentId, afterId: 0, limit: 50 });
  } catch (e) {
    inbox = { error: e.message, code: e.code };
  }
  console.log(JSON.stringify(inbox, null, 2));

  await closeDatabase();

  const unreadCount = Array.isArray(inbox.messages) ? inbox.messages.length : 0;
  if (unreadCount > 0) {
    console.log(`\n=== ${unreadCount} message(s) non lu(s) — lancement triage ===`);
    const bridge = path.resolve(__dirname, '../../backend/bin/genos-orchestrate.cjs');
    const payload = JSON.stringify({ mission: 'worker_inbox_triage', background: false, orchestratorId });
    const child = spawn(process.execPath, [bridge, payload], {
      cwd: repoRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, GENOS_STREAM_TELEMETRY: '1' }
    });
    child.on('close', (code) => {
      console.log(`[genos-orchestrate] exit=${code}`);
      process.exit(code || 0);
    });
    child.on('error', (e) => {
      console.error('Échec lancement bridge:', e.message);
      process.exit(2);
    });
  } else {
    console.log('\nTout clair.');
  }
}

triage().catch(e => { console.error(e.stack || e.message); process.exit(1); });

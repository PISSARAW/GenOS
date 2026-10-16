'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const intra = require('../src/services/morphogenesis/intraEpochAdaptationService');
const hook = require('../src/services/morphogenesis/intraEpochRoundHook');
const runtimeInbox = require('../src/services/localRuntimeIntraEpochInbox');
const observationInbox = require('../src/services/localRuntimeObservationInbox');
const observedGeneration = require('../src/services/localRuntimeObservedGeneration');
const orchestration = require('../src/services/agentOrchestrationState');
const organization = require('../src/services/dynamicOrganizationService');
const { getDatabase, closeDatabase } = require('../src/db');

function verifyDecisions() {
  const attention = intra.decideAttention({ uncertainty: 0.85 });
  assert.equal(attention.mode, 'refocus_diagnostics');
  assert.equal(attention.advisoryOnly, false);
  assert.equal(intra.decideAttention({ uncertainty: 0.1 }).mode, 'hold');
  assert.equal(intra.decideExchangeThrottle({ attempts: 3, redundant: 3 }).mode, 'pass');
  const throttle = intra.decideExchangeThrottle({ attempts: 10, redundant: 5 });
  assert.equal(throttle.mode, 'throttle_redundant_only');
  assert.equal(throttle.advisoryOnly, false);
  assert.equal(intra.decideStructural({ proposal: 'change-topology' }).mode,
    'deferred_to_barrier');
}

function verifyEffectiveExchangeGate() {
  intra.clearAll();
  let result;
  for (let index = 0; index < 10; index += 1) {
    result = intra.gateExchange({ orchestratorId: 'gate-root', epoch: 1,
      kind: 'question', signalType: 'ligand', digest: 'same-message' });
  }
  assert.equal(result.throttled, true, 'the repeated exchange must be suppressed');
  assert.equal(result.advisoryOnly, false);
  const novel = intra.gateExchange({ orchestratorId: 'gate-root', epoch: 1,
    kind: 'question', signalType: 'ligand', digest: 'new-message' });
  assert.equal(novel.throttled, false, 'a novel exchange must pass');
  const evidence = intra.gateExchange({ orchestratorId: 'gate-root', epoch: 1,
    kind: 'evidence', signalType: 'ligand', digest: 'same-message' });
  assert.equal(evidence.throttled, false, 'evidence must never be suppressed');
}

function verifyRuntimeDelivery() {
  intra.clearAll();
  let delivered = null;
  orchestration.activeProcesses.set('live-worker', {
    connected: true, genosCaptureBarrier: true, genosExecutionRunId: 'run-live',
    send(message) { delivered = message; }
  });
  const result = hook.observeExternal({ orchestratorId: 'live-root', epoch: 2,
    agentId: 'live-worker', signal: { kind: 'progress', uncertainty: 0.9 },
    emit() {} });
  orchestration.activeProcesses.delete('live-worker');
  assert.equal(result.modulation.appliedImmediately.attention, false,
    'the parent must not claim application before the child acknowledgement');
  assert.equal(delivered.type, 'genos-intra-epoch-modulation');
  assert.equal(delivered.runId, 'run-live');
}

async function verifyPublishedExchangeGate() {
  const dbPath = path.resolve(__dirname, `intra-epoch-${process.pid}.db`);
  process.env.GENOS_ADMIN_PASSWORD ||= 'intra-epoch-test-password';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('ie-root','Root','orchestrator','running','orchestrator')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('ie-a','A','implementation','running','worker','ie-root')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('ie-b','B','reviewer','running','worker','ie-root')");
    await organization.changeOrganization(db, { orchestratorId: 'ie-root',
      organization: 'red_blue_coevolution', reason: 'test active routing', changedBy: 'ie-root' });
    intra.clearAll();
    orchestration.autonomousRounds.set('ie-root', { epoch: 1, advanced: false });
    let result;
    for (let index = 0; index < 10; index += 1) {
      result = await organization.publish(db, { orchestratorId: 'ie-root',
        senderAgentId: 'ie-a', recipientAgentId: 'ie-b', kind: 'question',
        signalType: 'ligand', signalData: { event: 'same_question' } });
    }
    assert.equal(result.delivery, 'throttled');
    const rows = await db.get("SELECT COUNT(*) AS count FROM agent_organization_messages WHERE orchestrator_id = 'ie-root'");
    assert.equal(rows.count, 9, 'the throttled duplicate must not reach SQLite');
    const evidence = await organization.publish(db, { orchestratorId: 'ie-root',
      senderAgentId: 'ie-a', recipientAgentId: 'ie-b', kind: 'evidence',
      signalType: 'ligand', signalData: { event: 'same_question' } });
    assert.equal(evidence.delivery, 'delivered');
  } finally {
    orchestration.autonomousRounds.delete('ie-root');
    intra.clearAll();
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

async function verifyInferenceRebase() {
  runtimeInbox.clear();
  runtimeInbox.bind('inference-worker');
  observationInbox.bind('inference-worker');
  const state = { baseFramedPrompt: 'BASE', framedPrompt: 'BASE',
    autonomyPlan: {}, executionBudget: { latencyMs: 5000 } };
  let attempts = 0;
  const events = [];
  const tools = {
    checkpoint: { async save() {} },
    synthesis: { canonicalGeneration() { return null; } },
    async createGeneration() { return { generation: Promise.resolve('reply'),
      abort: {}, fallback: { used: false } }; },
    async awaitGeneration() {
      attempts += 1;
      if (attempts === 1) runtimeInbox.accept({
        type: 'genos-intra-epoch-modulation', agentId: 'inference-worker',
        runId: 'inference-run', revision: 1, mode: 'refocus_diagnostics',
        strength: 0.9, reason: 'high_uncertainty_requires_targeted_diagnostics'
      });
      return 'reply';
    },
    validateGeneration() {}, emitEvent(_state, event) { events.push(event); }
  };
  const reply = await observedGeneration.generate(state, tools);
  assert.equal(reply, 'reply');
  assert.equal(attempts, 2, 'a modulation received during inference must rebase generation');
  assert.match(state.framedPrompt, /ADAPTATION INTRA-EPOQUE GENOS/);
  assert.equal(state.intraEpochRevision, 1);
  assert.ok(events.some((event) => event.eventType === 'INTRA_EPOCH_ATTENTION_APPLIED'),
    'the child runtime must acknowledge effective application');
}

function verifyBarrierTrace() {
  const observations = intra.drainEpochObservations({
    orchestratorId: 'live-root', epoch: 2 });
  assert.ok(observations);
  assert.ok(observations.modulations <= intra.MAX_MODULATIONS_PER_EPOCH);
  assert.ok(Array.isArray(observations.observations));
}

async function main() {
  verifyDecisions();
  verifyEffectiveExchangeGate();
  verifyRuntimeDelivery();
  verifyBarrierTrace();
  await verifyPublishedExchangeGate();
  await verifyInferenceRebase();
  console.log('OK intra-epoch adaptation: inference rebased and redundant exchanges suppressed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

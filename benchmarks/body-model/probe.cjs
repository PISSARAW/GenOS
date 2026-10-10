'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');
const service = (name) => require(path.join(repo, 'backend/src/services', name));
const body = service('orchestratorBodyService');
const interoception = service('machineInteroceptionService');
const efference = service('efferenceCopyService');
const motor = service('perception/embodied/motorOutcomeAdapter');
const registry = require(path.join(repo, 'shared/effectorRegistry.json'));
const results = [];

async function probe(id, criterion, run) {
  try {
    const detail = await run();
    results.push({ id, verdict: 'PASS', criterion, detail });
  } catch (error) {
    results.push({ id, verdict: 'FAIL', criterion, detail: error.message });
  }
}

function memoryDb() {
  const rows = new Map();
  return {
    get: async (_sql, scope, key) => rows.has(`${scope}|${key}`)
      ? { payload_json: rows.get(`${scope}|${key}`) } : null,
    all: async () => [],
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (scope && !String(sql).includes('adaptive_state_events')) rows.set(`${scope}|${key}`, payload);
    }
  };
}

function telemetryDb() {
  const seen = [];
  return {
    seen,
    get: async (sql, agentId) => {
      seen.push({ sql, agentId });
      if (sql.includes('INFERENCE_COMPLETED')) {
        return agentId === 'agent-A'
          ? { completed: 8, started: 10, route_failed: 0 }
          : { completed: 2, started: 10, route_failed: 0 };
      }
      if (sql.includes('unconsolidated')) return { unconsolidated: agentId === 'agent-A' ? 10 : 400 };
      if (sql.includes('social_in')) return { social_in: 0, social_out: 0 };
      if (sql.includes('critical')) return { critical: 0 };
      if (sql.includes('stress_events')) return { stress_events: 0 };
      return { active_sessions: 0 };
    }
  };
}

(async () => {
  await probe('R1', 'Les mesures internes sont isolées par identifiant d’agent.', async () => {
    const db = telemetryDb();
    const a = await interoception.senseAgentRuntime(db, 'agent-A');
    const b = await interoception.senseAgentRuntime(db, 'agent-B');
    assert.equal(a.variables.energy, 0.8);
    assert.equal(b.variables.energy, 0.2);
    assert.equal(a.variables.memory_pressure, 0.02);
    assert.equal(b.variables.memory_pressure, 0.8);
    assert.equal(db.seen.length, 12);
    assert(db.seen.every((query) => query.sql.includes('agent_id = ?')));
    return { a: a.variables, b: b.variables, queries: db.seen.length };
  });

  await probe('R2', 'Un changement extérieur ne modifie pas le budget propre ; une variation du budget propre le modifie.', () => {
    const build = (workspaceRoot, tokens) => body.buildOrchestratorBody({
      normalizedMission: { workspaceRoot, toolLease: [] }, runtimeBudget: { tokens }
    });
    const a = build('C:/monde-1', 5000);
    const b = build('C:/monde-2', 5000);
    const c = build('C:/monde-2', 700);
    assert.equal(a.worldState.budget, b.worldState.budget);
    assert.equal(c.worldState.budget, 700);
    assert(c.reflexes.some((x) => x.id === 'budget_conservation'));
    return { budgetExterneChange: b.worldState.budget, budgetPropreChange: c.worldState.budget };
  });

  await probe('C1', 'Sans mesure du budget, le capteur ne doit pas déclarer une valeur mesurée avec confiance 1.', () => {
    const snapshot = body.buildOrchestratorBody({ normalizedMission: {} });
    const budget = snapshot.percepts.find((x) => x.kind === 'metabolic_budget');
    assert(!budget || budget.confidence < 1 || budget.value.tokens === null,
      `budget absent représenté par ${JSON.stringify(budget)}`);
    return budget;
  });

  await probe('C2', 'Les percepts de budget et de workspace gardent des sources distinctes.', () => {
    const snapshot = body.buildOrchestratorBody({
      normalizedMission: { workspaceRoot: 'C:/monde' }, runtimeBudget: { tokens: 5000 }
    });
    const budget = snapshot.percepts.find((x) => x.kind === 'metabolic_budget');
    const workspace = snapshot.percepts.find((x) => x.kind === 'filesystem_state');
    assert.equal(budget.source, 'proprioception');
    assert.equal(workspace.source, 'filesystem_touch');
    assert.equal(workspace.value.workspaceRoot, 'C:/monde');
    return { budgetSource: budget.source, workspaceSource: workspace.source };
  });

  await probe('E1', 'Le registre signale explicitement les effecteurs sans suivi causal.', () => {
    const counts = Object.fromEntries([...new Set(registry.effectors.map((x) => x.status))]
      .map((status) => [status, registry.effectors.filter((x) => x.status === status).length]));
    assert(counts.covered > 0);
    assert(Object.keys(counts).some((status) => status !== 'covered'));
    return counts;
  });

  await probe('E2', 'Une commande motrice doit être liée à un agent propriétaire.', async () => {
    let executions = 0;
    const result = await motor.execute({
      environmentRef: 'env://agent-B',
      intent: { intentId: 'move-1', action: 'move' },
      environment: { execute: async () => {
        executions += 1;
        return { status: 'completed', evidenceRefs: ['receipt:foreign'] };
      } }
    });
    assert.equal(executions, 0, `effecteur sans identité exécuté : ${JSON.stringify(result)}`);
    return result;
  });

  await probe('A1', 'Une conséquence est attribuée au soi seulement si le type et l’action correspondent.', async () => {
    const db = memoryDb();
    await efference.predict(db, 'agent-A', { action: 'move', actionId: 'action-A', expectedTypes: ['MOVED'] });
    const wrong = await efference.discharge(db, 'agent-A', {
      eventType: 'MOVED', payload: { sourceActionId: 'action-B' }
    });
    const right = await efference.discharge(db, 'agent-A', {
      eventType: 'MOVED', payload: { sourceActionId: 'action-A' }
    });
    const replay = await efference.discharge(db, 'agent-A', {
      eventType: 'MOVED', payload: { sourceActionId: 'action-A' }
    });
    assert.equal(wrong.matched, false);
    assert.equal(right.matched, true);
    assert.equal(replay.matched, false);
    return { wrong, right, replay };
  });

  await probe('A2', 'Un événement attribué à un autre agent ne doit pas être réattribué au soi malgré un identifiant d’action identique.', async () => {
    const db = memoryDb();
    await efference.predict(db, 'agent-A', { action: 'move', actionId: 'shared-action', expectedTypes: ['MOVED'] });
    const foreign = await efference.discharge(db, 'agent-A', {
      eventType: 'MOVED', payload: { sourceActionId: 'shared-action', agentId: 'agent-B' }
    });
    assert.equal(foreign.matched, false, `événement externe attribué au soi : ${JSON.stringify(foreign)}`);
    return foreign;
  });

  console.log(JSON.stringify({ runAt: new Date().toISOString(), results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });

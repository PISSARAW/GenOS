/**
 * GenOS SWE-bench Native Agent Fleet Service
 * Materializes real, authentic autonomous GenOS v3 agents in SQLite (agents table),
 * tracking individual cognitive budgets, genomes, dissonance, and eureka moments.
 */

const crypto = require('crypto');
const { generateAgentIdentity } = require('../services/agentIdentityService');
const { evolveWorkerGenome } = require('../services/agentEvolutionService');
const { createConscienceState } = require('../services/agentConscienceService');
const { emit } = require('../services/agentOrchestrationState');

function buildAgentEntity(spec) {
  const { id, name, meaning, role, mode, parentId, fleetId, task } = spec;
  const conscience = createConscienceState({ currentBudget: 100.0, baselineBudget: 100.0 });
  return {
    id,
    name,
    name_meaning: meaning,
    role,
    status: 'running',
    agent_type: 'GenOS',
    execution_mode: mode,
    fleet_id: fleetId,
    parent_agent_id: parentId,
    model_tier: 'deepseek-coder-v2:latest',
    language: 'Python',
    isolation_mode: 'VFS_Branch',
    current_task: task,
    cognitive_budget: conscience.currentBudget,
    cognitive_baseline_budget: conscience.baselineBudget,
    dissonance_level: conscience.dissonanceLevel,
    eureka_count: 0,
    about: `Autonomous SWE-bench agent specializing in ${role}.`
  };
}

async function insertAgent(db, agent) {
  const query = `
    INSERT OR REPLACE INTO agents (
      id, name, name_meaning, role, status, agent_type, execution_mode,
      fleet_id, parent_agent_id, model_tier, language, isolation_mode,
      current_task, cognitive_budget, cognitive_baseline_budget,
      dissonance_level, eureka_count, about, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  await db.run(query, [
    agent.id, agent.name, agent.name_meaning, agent.role, agent.status,
    agent.agent_type, agent.execution_mode, agent.fleet_id, agent.parent_agent_id,
    agent.model_tier, agent.language, agent.isolation_mode, agent.current_task,
    agent.cognitive_budget, agent.cognitive_baseline_budget, agent.dissonance_level,
    agent.eureka_count, agent.about
  ]);
}

async function registerSweFleet(db, fleetConfig) {
  const { fleetId, instanceId, repo } = fleetConfig;
  const hash = crypto.createHash('sha256').update(`${fleetId}_${instanceId}`).digest('hex').slice(0, 6);

  const leadId = `agent_griot_${hash}`;
  const leadIdentity = generateAgentIdentity({ preferredName: 'Griot', role: 'SWE Mission Lead' });
  const lead = buildAgentEntity({
    id: leadId,
    name: `Griot-${hash}`,
    meaning: leadIdentity.name_meaning,
    role: 'lead_orchestrator',
    mode: 'orchestrator',
    parentId: null,
    fleetId,
    task: `Lead autonomous resolution for ${instanceId} on ${repo}`
  });
  await insertAgent(db, lead);

  const workerSpecs = [
    { key: 'localizer', name: 'Kwame', role: 'fault_localization_engineer', desc: 'Proprioceptive stack trace & symbol localization' },
    { key: 'coder', name: 'Chidi', role: 'surgical_repair_engineer', desc: 'Biomimetic NER excision & SEARCH/REPLACE synthesis' },
    { key: 'reviewer', name: 'Sekou', role: 'quality_gate_reviewer', desc: 'Pre-flight VFS simulation & py_compile evidence gate' },
    { key: 'verifier', name: 'Nia', role: 'dynamic_verification_engineer', desc: 'Dynamic host pytest verification (FAIL_TO_PASS & PASS_TO_PASS)' }
  ];

  const workers = {};
  for (const spec of workerSpecs) {
    const workerId = `agent_${spec.name.toLowerCase()}_${hash}`;
    const identity = generateAgentIdentity({ preferredName: spec.name, role: spec.role });
    const genome = evolveWorkerGenome(lead, { role: spec.role });
    const worker = buildAgentEntity({
      id: workerId,
      name: `${spec.name}-${hash}`,
      meaning: identity.name_meaning,
      role: spec.role,
      mode: 'worker',
      parentId: leadId,
      fleetId,
      task: spec.desc
    });
    worker.genome = genome.genes;
    await insertAgent(db, worker);
    workers[spec.key] = worker;
    emit(leadId, 'WORKER_REGISTERED', 'SPAWN', `Worker '${worker.name}' joined fleet for ${instanceId}`, { workerId, role: spec.role });
  }

  return { lead, ...workers, fleetId, instanceId };
}

async function updateAgentProgress(db, update) {
  const { agentId, task, budgetDelta, dissonanceDelta } = update;
  const current = await db.get('SELECT cognitive_budget, dissonance_level FROM agents WHERE id = ?', [agentId]);
  if (!current) return;

  const newBudget = Math.max(0, (current.cognitive_budget || 100.0) - (budgetDelta || 0));
  const newDissonance = Math.max(0, (current.dissonance_level || 0.0) + (dissonanceDelta || 0));

  await db.run(
    'UPDATE agents SET current_task = COALESCE(?, current_task), cognitive_budget = ?, dissonance_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [task || null, newBudget, newDissonance, agentId]
  );
}

async function recordEurekaMoment(db, agentId) {
  await db.run(
    'UPDATE agents SET eureka_count = eureka_count + 1, dissonance_level = 0.0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [agentId]
  );
  emit(agentId, 'EUREKA_MOMENT', 'SOLVED', `Agent '${agentId}' achieved verification breakthrough`, { agentId });
}

async function retireSweFleet(db, fleet) {
  const agentIds = [fleet.lead.id, fleet.localizer.id, fleet.coder.id, fleet.reviewer.id, fleet.verifier.id];
  for (const id of agentIds) {
    await db.run("UPDATE agents SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    emit(id, 'AGENT_COMPLETED', 'RETIRE', `Agent completed SWE task ${fleet.instanceId}`, { agentId: id });
  }
}

module.exports = {
  registerSweFleet,
  updateAgentProgress,
  recordEurekaMoment,
  retireSweFleet
};

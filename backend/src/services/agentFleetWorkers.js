module.exports = { createAutonomousWorkers };

async function createAutonomousWorkers(db, orchestrator, options = {}) {
  const circuitBreaker = require('./circuitBreaker');
  const circuit = circuitBreaker.canExecute('worker_deployment', orchestrator.agent_type);
  if (!circuit.allowed) {
    throw new Error(`Worker deployment rejected: ${circuit.message}`);
  }
  
  const plan = options.plan || options;
  const mission = options.mission || (arguments[3] || {});
  const assignments = plan.dispatchWorkers || [];
  const workerGarage = require('./workerGarageService');
  const configuredMax = Number(process.env.GENOS_MAX_AUTONOMOUS_WORKERS || process.env.GENOS_MAX_ACTIVE_WORKERS);
  const MAX_AUTONOMOUS_WORKERS = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.floor(configuredMax) : workerGarage.maxActiveWorkers();
  if (!assignments.length) return [];
  if (assignments.length > MAX_AUTONOMOUS_WORKERS) {
    throw Object.assign(new Error(`Autonomous worker fan-out exceeds the ${MAX_AUTONOMOUS_WORKERS}-worker limit.`), { code: 'WORKER_FANOUT_LIMIT' });
  }
  const parent = await db.get(
        `SELECT a.id, a.name, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode, a.current_task,
          a.cognitive_budget, a.cognitive_baseline_budget,
          w.path AS workspace_path, w.organization_id, w.project_id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`,
    orchestrator.id
  );
  if (!parent) throw new Error(`Orchestrator '${orchestrator.id}' disappeared before worker creation`);
  const initialRound = plan.tokenPolicy?.rounds?.initial;
  const initialWorkerTokens = initialRound?.workerTokens;
  if (initialWorkerTokens && initialWorkerTokens.length !== assignments.length) {
    throw Object.assign(new Error('Initial worker allocation does not match dispatch assignments.'), { code: 'INVALID_WORKER_ALLOCATION' });
  }
  const perWorkerTokens = Math.max(1, initialRound?.perWorkerTokens || Math.floor(((plan.tokenPolicy?.total || 10000) * (plan.tokenPolicy?.workerShare || 0.6)) / assignments.length));
  const perWorkerCognitiveBudget = calculateInheritedCognitiveBudget(
    parent.cognitive_budget,
    plan.tokenPolicy?.workerShare,
    assignments.length
  );
  const splitBudget = (value, index) => {
    const total = Number(value);
    if (!Number.isFinite(total) || total <= 0) return undefined;
    const base = Math.floor(total / assignments.length);
    return base + (index < total - (base * assignments.length) ? 1 : 0);
  };
  const workers = [];
  const sourceWorkspace = parent.workspace_path || mission.workspaceRoot;
  const samePath = (a, b) => a && b && (process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
  if (parent.workspace_path && mission.workspaceRoot && !samePath(mission.workspaceRoot, parent.workspace_path)) {
    throw Object.assign(new Error(`Mission workspace root does not match workspace '${parent.workspace_id}'.`), { code: 'WORKSPACE_ROOT_MISMATCH' });
  }
  const usedNames = [];
  for (const [index, assignment] of assignments.entries()) {
    const assignedTokens = initialWorkerTokens?.[index] || perWorkerTokens;
    const id = autonomousWorkerId(orchestrator.id, index + 1);
    const identity = agentIdentity.generateAgentIdentity({
      preferredName: assignment.preferredName || assignment.name,
      role: assignment.role,
      excludeNames: usedNames,
      stableKey: id
    });
    usedNames.push(identity.name);
    const name = identity.name;
    const nameMeaning = identity.name_meaning;
    const evolution = agentEvolution.evolveWorkerGenome(parent, assignment, {
      strategy: plan.strategyContract?.primary || 'tree-search'
    });
    const initialConscience = agentConscience.createConscienceState({
      currentBudget: perWorkerCognitiveBudget,
      baselineBudget: perWorkerCognitiveBudget
    });
    const localRoute = await localWorkerRoute(db, parent.id, assignment.role, assignment.modelTier || parent.model_tier, { organizationId: parent.organization_id, projectId: parent.project_id });
    const prompt = [
      identity.introduction,
      agentConscience.formatConsciencePrompt(initialConscience),
      mission.prompt || parent.current_task || 'Autonomous task execution',
      `Assigned branch: ${assignment.label}.`,
      Array.isArray(assignment.capabilities) && assignment.capabilities.length
        ? `Owned capabilities: ${assignment.capabilities.join(', ')}.`
        : null,
      `Hypothesis: ${assignment.hypothesis}`,
      assignment.artifact === 'creative' || /author|literary|dramaturg/i.test(assignment.role || '')
        ? 'Creative evidence must include artifact="creative", artifactText, and creativeEvaluation with a 0..1 rubric for craft, coherence, originality, emotionalImpact, and constraintCoverage; include revisions and criticEvidence when available.'
        : null,
      plan.tokenPolicy.allocation === 'successive_halving_with_reallocation'
        ? `Budget round: initial screening. Use at most ${perWorkerTokens} tokens.`
        : `Budget allocation: ${perWorkerTokens} tokens.`
    ].filter(Boolean).join('\n');
    const promptTokenEstimate = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4);
    if (assignedTokens > 0 && promptTokenEstimate >= assignedTokens) {
      throw Object.assign(new Error(`Worker '${assignment.label || id}' prompt consumes its token budget before generation (${promptTokenEstimate} >= ${assignedTokens}).`), { code: 'WORKER_PROMPT_BUDGET_EXCEEDED' });
    }
    await agentEvolution.recordWorkerLineage(db, {
      agentId: id, name, role: assignment.role, workspaceId: parent.workspace_id
    }, {
      parentId: parent.id,
      genes: evolution.genes,
      parents: evolution.parents,
      predictedFitness: evolution.predictedFitness
    });
    const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, id, mission.capsuleRoot);
    await db.run(
      `INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task, dissonance_level, eureka_count, cognitive_budget, is_apoptotic)
       VALUES (?, ?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'autonomous_strategy_branch', ?, ?, ?, ?, ?, ?)`,
      id, name, nameMeaning, assignment.role, parent.agent_type || 'GenOS',
      parent.workspace_id || null, parent.fleet_id || null, localRoute.selectedModel || assignment.modelTier || parent.model_tier || 'standard',
      parent.language || 'TypeScript', parent.isolation_mode || 'Branch', parent.id,
      `${identity.introduction} Budget round: initial; allocation: ${assignedTokens} tokens.`, prompt,
      initialConscience.dissonanceLevel, initialConscience.eurekaMoments, initialConscience.currentBudget, initialConscience.isApoptotic ? 1 : 0
    );
    const debit = await db.run(
      `UPDATE agents
       SET cognitive_budget = ROUND(MAX(0, COALESCE(cognitive_budget, 0) - ?), 6), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND (cognitive_budget >= ? OR (? - cognitive_budget) < 0.0001)`,
      perWorkerCognitiveBudget,
      parent.id,
      perWorkerCognitiveBudget,
      perWorkerCognitiveBudget
    );
    if (debit.changes !== 1) {
      await db.run('DELETE FROM agents WHERE id = ?', id).catch(() => {});
      throw Object.assign(new Error(`Unable to debit inherited cognitive budget from orchestrator '${parent.id}'.`), { code: 'BUDGET_INHERITANCE_FAILURE' });
    }
    workers.push({
      agentId: id, label: assignment.label || id, name, nameMeaning, introduction: identity.introduction, role: assignment.role, prompt,
      branchAssignment: `${assignment.label}: ${assignment.hypothesis}`,
      artifact: assignment.artifact || plan.aTeam?.artifact || plan.trinity?.artifact || null,
      pipelineStage: Math.max(0, Number(assignment.pipelineStage || 0)),
      dependsOn: Array.isArray(assignment.dependsOn) ? assignment.dependsOn : [],
      modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode,
      workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type,
      workspaceRoot, workspaceProvisioned: true, localModel: localRoute.selectedModel, localRoutingPolicy: localRoute.policy, localRoutingCriteria: localRoute.criteria, toolLease: workerToolLease(assignment.role),
      executionPolicy: mission.executionPolicy,
      executionBudget: {
        ...mission.executionBudget,
        tokens: assignedTokens,
        ...(splitBudget(mission.executionBudget?.costUsd, index) !== undefined ? { costUsd: splitBudget(mission.executionBudget.costUsd, index) } : {}),
        ...(splitBudget(mission.executionBudget?.events, index) !== undefined ? { events: splitBudget(mission.executionBudget.events, index) } : {})
      }, orchestratorAgentId: parent.id, budgetRound: { stage: 'initial', orchestratorId: parent.id },
      genome: evolution.genes, predictedFitness: evolution.predictedFitness
    });
    emit(orchestrator.id, 'WORKER_CAPABILITY_LEASED', 'LEASE', `Worker '${name}' received ${workers[workers.length - 1].toolLease.length} leased tools.`, {
      workerId: id,
      role: assignment.role,
      toolLease: workers[workers.length - 1].toolLease,
      runtimeMode: workers[workers.length - 1].localRuntime === true ? 'local' : 'supervised'
    }, 'info');
  }
  return workers;
}
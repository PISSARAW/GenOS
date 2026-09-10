module.exports = { createAutonomousWorkers };

const path = require('path');
const circuitBreaker = require('./circuitBreaker');
const workerGarage = require('./workerGarageService');
const { localWorkerRoute } = require('./agentModelRoutingService');
const { autonomousWorkerId } = require('./agentRoundService');
const { createIsolatedWorkspace } = require('./agentWorkspaceLifecycleService');
const { emit, workerToolLease } = require('./agentOrchestrationState');
const agentIdentity = require('./agentIdentityService');
const agentConscience = require('./agentConscienceService');
const agentEvolution = require('./agentEvolutionService');

function calculateInheritedCognitiveBudget(parentBudget, workerShare, workerCount) {
  const normalizedParentBudget = Math.max(0, Number(parentBudget ?? 100));
  const normalizedWorkerShare = Number.isFinite(Number(workerShare))
    ? Math.max(0, Math.min(1, Number(workerShare)))
    : 0.6;
  const normalizedWorkerCount = Math.max(1, Math.floor(Number(workerCount) || 1));
  return (normalizedParentBudget * normalizedWorkerShare) / normalizedWorkerCount;
}

async function createAutonomousWorkers(db, orchestrator, options = {}) {
  const circuit = circuitBreaker.canExecute('worker_deployment', orchestrator.agent_type);
  if (!circuit.allowed) {
    throw new Error(`Worker deployment rejected: ${circuit.message}`);
  }
  
  const plan = options.plan || options;
  const mission = options.mission || (arguments[3] || {});
  const assignments = plan.dispatchWorkers || [];
  validateAssignments(assignments);
  const parent = await db.get(
        `SELECT a.id, a.name, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode, a.current_task,
          a.cognitive_budget, a.cognitive_baseline_budget,
          w.path AS workspace_path, w.organization_id, w.project_id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`,
    orchestrator.id
  );
  if (!parent) throw new Error(`Orchestrator '${orchestrator.id}' disappeared before worker creation`);
  const context = buildWorkerContext({ parent, plan, mission, assignments });
  const usedNames = [];
  const workers = [];
  for (const [index, assignment] of assignments.entries()) {
    workers.push(await createWorker({ db, orchestrator, assignment, index, usedNames, ...context }));
  }
  return workers;
}

function validateAssignments(assignments) {
  const configuredMax = Number(process.env.GENOS_MAX_AUTONOMOUS_WORKERS || process.env.GENOS_MAX_ACTIVE_WORKERS);
  const maximum = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.floor(configuredMax) : workerGarage.maxActiveWorkers();
  if (!assignments.length) return;
  if (assignments.length > maximum) {
    throw Object.assign(new Error(`Autonomous worker fan-out exceeds the ${maximum}-worker limit.`), { code: 'WORKER_FANOUT_LIMIT' });
  }
}

function buildWorkerContext(context) {
  const { parent, plan, mission, assignments } = context;
  const initialRound = plan.tokenPolicy?.rounds?.initial;
  const initialWorkerTokens = initialRound?.workerTokens;
  if (initialWorkerTokens && initialWorkerTokens.length !== assignments.length) {
    throw Object.assign(new Error('Initial worker allocation does not match dispatch assignments.'), { code: 'INVALID_WORKER_ALLOCATION' });
  }
  const sourceWorkspace = parent.workspace_path || mission.workspaceRoot;
  if (parent.workspace_path && mission.workspaceRoot && !samePath(mission.workspaceRoot, parent.workspace_path)) {
    throw Object.assign(new Error(`Mission workspace root does not match workspace '${parent.workspace_id}'.`), { code: 'WORKSPACE_ROOT_MISMATCH' });
  }
  return { ...context, sourceWorkspace, initialWorkerTokens, ...workerBudgets({ parent, plan, assignmentCount: assignments.length, initialRound }) };
}

function workerBudgets(context) {
  const { parent, plan, assignmentCount, initialRound } = context;
  const workerTokens = initialRound?.perWorkerTokens || Math.floor(((plan.tokenPolicy?.total || 10000) * (plan.tokenPolicy?.workerShare || 0.6)) / assignmentCount);
  return {
    perWorkerTokens: Math.max(1, workerTokens),
    perWorkerCognitiveBudget: calculateInheritedCognitiveBudget(parent.cognitive_budget, plan.tokenPolicy?.workerShare, assignmentCount)
  };
}

function samePath(firstPath, secondPath) {
  if (!firstPath || !secondPath) return false;
  const normalizedFirst = path.resolve(firstPath);
  const normalizedSecond = path.resolve(secondPath);
  return process.platform === 'win32'
    ? normalizedFirst.toLowerCase() === normalizedSecond.toLowerCase()
    : normalizedFirst === normalizedSecond;
}

function buildWorkerPrompt(details) {
  const { identity, conscience, assignment, context } = details;
  const creative = assignment.artifact === 'creative' || /author|literary|dramaturg/i.test(assignment.role || '');
  return [
    identity.introduction,
    agentConscience.formatConsciencePrompt(conscience),
    context.mission.prompt || context.parent.current_task || 'Autonomous task execution',
    `Assigned branch: ${assignment.label}.`,
    Array.isArray(assignment.capabilities) && assignment.capabilities.length ? `Owned capabilities: ${assignment.capabilities.join(', ')}.` : null,
    `Hypothesis: ${assignment.hypothesis}`,
    creative ? 'Creative evidence must include artifact="creative", artifactText, and creativeEvaluation with a 0..1 rubric for craft, coherence, originality, emotionalImpact, and constraintCoverage; include revisions and criticEvidence when available.' : null,
    context.plan.tokenPolicy.allocation === 'successive_halving_with_reallocation' ? `Budget round: initial screening. Use at most ${context.perWorkerTokens} tokens.` : `Budget allocation: ${context.perWorkerTokens} tokens.`
  ].filter(Boolean).join('\n');
}

async function createWorker(workerContext) {
  const { db, orchestrator, assignment, index, usedNames, parent, plan, mission, sourceWorkspace, initialWorkerTokens, perWorkerTokens, perWorkerCognitiveBudget } = workerContext;
  const assignedTokens = initialWorkerTokens?.[index] || perWorkerTokens;
  const id = autonomousWorkerId(orchestrator.id, index + 1);
  const identity = agentIdentity.generateAgentIdentity({ preferredName: assignment.preferredName || assignment.name, role: assignment.role, excludeNames: usedNames, stableKey: id });
  usedNames.push(identity.name);
  const evolution = agentEvolution.evolveWorkerGenome(parent, assignment, { strategy: plan.strategyContract?.primary || 'tree-search' });
  const conscience = agentConscience.createConscienceState({ currentBudget: perWorkerCognitiveBudget, baselineBudget: perWorkerCognitiveBudget });
  const prompt = buildWorkerPrompt({ identity, conscience, assignment, context: workerContext });
  validatePromptBudget({ prompt, assignedTokens, assignment, id });
  const route = await localWorkerRoute(db, parent.id, assignment.role, assignment.modelTier || parent.model_tier, { organizationId: parent.organization_id, projectId: parent.project_id });
  const isVfsWorker = !/coder|developer|implementation/i.test(assignment.role || '');
  const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, id, {
    capsuleRoot: mission.capsuleRoot,
    vfs: mission.vfsWorkspace === true || (workerContext.assignments?.length > 12 && isVfsWorker)
  });
  await persistWorker(db, { id, identity, assignment, parent, route, conscience, prompt, assignedTokens, perWorkerCognitiveBudget });
  return formatWorker({ id, identity, assignment, parent, plan, mission, route, workspaceRoot, prompt, assignedTokens, index, evolution, orchestrator, assignments: workerContext.assignments || plan.dispatchWorkers });
}

function validatePromptBudget(details) {
  const { prompt, assignedTokens, assignment, id } = details;
  const estimate = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4);
  if (assignedTokens > 0 && estimate >= assignedTokens) {
    throw Object.assign(new Error(`Worker '${assignment.label || id}' prompt consumes its token budget before generation (${estimate} >= ${assignedTokens}).`), { code: 'WORKER_PROMPT_BUDGET_EXCEEDED' });
  }
}

async function persistWorker(db, details) {
  const { id, identity, assignment, parent, route, conscience, prompt, assignedTokens, perWorkerCognitiveBudget } = details;
  await db.run(`INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task, dissonance_level, eureka_count, cognitive_budget, is_apoptotic) VALUES (?, ?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'autonomous_strategy_branch', ?, ?, ?, ?, ?, ?)`, ...workerInsertValues(details));
  const debit = await db.run(`UPDATE agents SET cognitive_budget = ROUND(MAX(0, COALESCE(cognitive_budget, 0) - ?), 6), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (cognitive_budget >= ? OR (? - cognitive_budget) < 0.0001)`, perWorkerCognitiveBudget, parent.id, perWorkerCognitiveBudget, perWorkerCognitiveBudget);
  if (debit.changes !== 1) {
    await db.run('DELETE FROM agents WHERE id = ?', id).catch(() => {});
    throw Object.assign(new Error(`Unable to debit inherited cognitive budget from orchestrator '${parent.id}'.`), { code: 'BUDGET_INHERITANCE_FAILURE' });
  }
}

function workerInsertValues(details) {
  const { id, identity, assignment, parent, route, conscience, prompt, assignedTokens } = details;
  return [id, identity.name, identity.name_meaning, assignment.role, parent.agent_type || 'GenOS', parent.workspace_id || null, parent.fleet_id || null, route.selectedModel || assignment.modelTier || parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', parent.id, `${identity.introduction} Budget round: initial; allocation: ${assignedTokens} tokens.`, prompt, conscience.dissonanceLevel, conscience.eurekaMoments, conscience.currentBudget, conscience.isApoptotic ? 1 : 0];
}

function formatWorker(details) {
  const { id, identity, assignment, parent, plan, mission, route, workspaceRoot, prompt, assignedTokens, index, evolution, orchestrator } = details;
  const toolLease = workerToolLease(assignment.role);
  const assignmentList = details.assignments || plan?.dispatchWorkers || [];
  const worker = { ...workerIdentity({ id, identity, assignment, parent, plan, prompt }), ...workerRuntime({ parent, route, workspaceRoot, toolLease, assignments: assignmentList }), executionPolicy: mission.executionPolicy, executionBudget: buildExecutionBudget({ executionBudget: mission.executionBudget, assignedTokens, index, assignmentCount: assignmentList.length || 1 }), orchestratorAgentId: parent.id, budgetRound: { stage: 'initial', orchestratorId: parent.id }, genome: evolution.genes, predictedFitness: evolution.predictedFitness };
  emit(orchestrator.id, 'WORKER_CAPABILITY_LEASED', 'LEASE', `Worker '${identity.name}' received ${toolLease.length} leased tools.`, { workerId: id, role: assignment.role, toolLease, runtimeMode: worker.localRuntime === true ? 'local' : 'supervised' }, 'info');
  return worker;
}

function workerIdentity(details) {
  const { id, identity, assignment, parent, plan, prompt } = details;
  return { agentId: id, label: assignment.label || id, name: identity.name, nameMeaning: identity.name_meaning, introduction: identity.introduction, role: assignment.role, prompt, branchAssignment: `${assignment.label}: ${assignment.hypothesis}`, artifact: assignment.artifact || plan.aTeam?.artifact || plan.trinity?.artifact || null, pipelineStage: Math.max(0, Number(assignment.pipelineStage || 0)), dependsOn: Array.isArray(assignment.dependsOn) ? assignment.dependsOn : [], modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode, workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type };
}

function workerRuntime(details) {
  const { parent, route, workspaceRoot, toolLease, assignments } = details;
  const inProcessWorker = process.env.GENOS_IN_PROCESS_WORKERS === '1' || (Array.isArray(assignments) && assignments.length > 12);
  return { workspaceRoot, workspaceProvisioned: true, inProcessWorker, localModel: route.selectedModel, localRoutingPolicy: route.policy, localRoutingCriteria: route.criteria, toolLease, workspaceIsolation: parent.isolation_mode };
}

function buildExecutionBudget(details) {
  const { executionBudget, assignedTokens, index, assignmentCount } = details;
  const costUsd = splitBudget(executionBudget?.costUsd, index, assignmentCount);
  const events = splitBudget(executionBudget?.events, index, assignmentCount);
  return { ...executionBudget, tokens: assignedTokens, ...allocatedBudgetFields(costUsd, events) };
}

function allocatedBudgetFields(costUsd, events) {
  return { ...(costUsd === undefined ? {} : { costUsd }), ...(events === undefined ? {} : { events }) };
}

function splitBudget(value, index, assignments) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const base = Math.floor(total / assignments);
  return base + (index < total - (base * assignments) ? 1 : 0);
}
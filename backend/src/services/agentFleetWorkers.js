module.exports = { createAutonomousWorkers, splitBudget, buildExecutionBudget, inheritedWorkerEngine, calculateInheritedCognitiveBudget, buildWorkerPrompt };

const path = require('path');
const circuitBreaker = require('./circuitBreaker');
const workerGarage = require('./workerGarageService');
const { localWorkerRoute } = require('./agentModelRoutingService');
const { autonomousWorkerId } = require('./agentRoundService');
const { createIsolatedWorkspace } = require('./agentWorkspaceLifecycleService');
const { emit, workerToolLeaseForCapabilities } = require('./agentOrchestrationState');
const agentIdentity = require('./agentIdentityService');
const agentConscience = require('./agentConscienceService');
const agentEvolution = require('./agentEvolutionService');
const agentDnaStore = require('./agentDnaStore');
const { withTransaction } = require('../db');
const config = require('../config/orchestratorConfig');

async function applyAgentDna(ctx) {
  const { db, parent, assignment, mission, evolution } = ctx;
  const scope = { organizationId: parent.organization_id, projectId: parent.project_id };
  const missionText = (mission && mission.prompt) || parent.current_task || '';
  const selection = await agentDnaStore.workerGenesForAssignment(db, { ...assignment, agentId: parent.id, mission: missionText }, scope);
  if (!selection) return;
  evolution.genes = { ...evolution.genes, ...selection.genes };
  evolution.source = 'agent_dna';
  evolution.dnaGenomeRef = selection.genomeRef;
  assignment.genomeRef = selection.genomeRef;
}

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
  const maximum = workerGarage.maxActiveWorkers();
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
  const cognitivePhenotype = require('./cognitivePhenotypeService');
  const phenotypeBlock = cognitivePhenotype.formatPhenotypePrompt(assignment.cognitiveRecipe);
  return [
    identity.introduction,
    agentConscience.formatConsciencePrompt(conscience),
    context.mission.prompt || context.parent.current_task || 'Autonomous task execution',
    `Assigned branch: ${assignment.label}.`,
    Array.isArray(assignment.capabilities) && assignment.capabilities.length ? `Owned capabilities: ${assignment.capabilities.join(', ')}.` : null,
    `Hypothesis: ${assignment.hypothesis}`,
    phenotypeBlock,
    creative ? 'Creative evidence must include artifact="creative", artifactText, and creativeEvaluation with a 0..1 rubric for craft, coherence, originality, emotionalImpact, and constraintCoverage; include revisions and criticEvidence when available.' : null,
    context.plan.tokenPolicy.allocation === 'successive_halving_with_reallocation' ? `Budget round: initial screening. Use at most ${context.perWorkerTokens} tokens.` : `Budget allocation: ${context.perWorkerTokens} tokens.`
  ].filter(Boolean).join('\n');
}

async function createWorker(workerContext) {
  const assets = await prepareWorkerAssets(workerContext);
  await persistWorker(assets.db, assets);
  return formatWorker(assets);
}

async function prepareWorkerAssets(workerContext) {
  const { db, orchestrator, assignment, index, usedNames, parent, plan, mission, initialWorkerTokens, perWorkerTokens, perWorkerCognitiveBudget } = workerContext;
  const assignedTokens = initialWorkerTokens?.[index] || perWorkerTokens;
  const id = autonomousWorkerId(orchestrator.id, index + 1);
  const identity = agentIdentity.generateAgentIdentity({ preferredName: assignment.preferredName || assignment.name, role: assignment.role, excludeNames: usedNames, stableKey: id });
  usedNames.push(identity.name);
  const evolution = await agentEvolution.evolveWorkerGenome(parent, assignment, { strategy: plan.strategyContract?.primary || 'tree-search', db });
  await applyAgentDna({ db, parent, assignment, mission, evolution });
  const conscience = agentConscience.createConscienceState({ currentBudget: perWorkerCognitiveBudget, baselineBudget: perWorkerCognitiveBudget });
  const prompt = buildWorkerPrompt({ identity, conscience, assignment, context: workerContext });
  validatePromptBudget({ prompt, assignedTokens, assignment, id });
  const route = mission.executor === 'caller_mcp' ? {} : await localWorkerRoute(db, parent.id, assignment.role, assignment.modelTier || parent.model_tier, { organizationId: parent.organization_id, projectId: parent.project_id });
  const workspaceRoot = await createWorkerWorkspace(workerContext, id);
  return { ...workerContext, id, identity, conscience, prompt, assignedTokens, route, workspaceRoot, evolution, mission };
}

function createWorkerWorkspace(workerContext, id) {
  const { assignment, mission, sourceWorkspace } = workerContext;
  const isVfsWorker = !/coder|developer|implementation/i.test(assignment.role || '');
  const assignments = workerContext.assignments || [];
  const allowEdits = mission.executionPolicy?.allowFileEdits === true || config.allowFileEdits();
  return createIsolatedWorkspace(sourceWorkspace, id, {
    capsuleRoot: mission.capsuleRoot,
    vfs: !allowEdits || mission.vfsWorkspace === true || (assignments.length > 12 && isVfsWorker)
  });
}

function validatePromptBudget(details) {
  const { prompt, assignedTokens, assignment, id } = details;
  const estimate = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4);
  if (assignedTokens > 0 && estimate >= assignedTokens) {
    throw Object.assign(new Error(`Worker '${assignment.label || id}' prompt consumes its token budget before generation (${estimate} >= ${assignedTokens}).`), { code: 'WORKER_PROMPT_BUDGET_EXCEEDED' });
  }
}

async function persistWorker(db, details) {
  const { parent, perWorkerCognitiveBudget, assignment, id, identity } = details;
  const { getAttribute, setAttribute } = require('./ontologyAttributes');
  if (!(await getAttribute(parent.id, 'worker_capacity'))) await setAttribute({ agentId: parent.id, key: 'worker_capacity',
    value: { role: parent.role, purpose: 'Delegate bounded mission work' },
    modality: 'accidental', provenance: 'agentFleetWorkers' });
  // The worker INSERT and the parent budget debit must be one atomic unit:
  // otherwise two concurrent workers each read the same balance and over-allocate.
  // Retry with exponential backoff on BUDGET_INHERITANCE_FAILURE (race condition).
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await withTransaction(db, async () => {
        await db.run(`INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task, dissonance_level, eureka_count, cognitive_budget, is_apoptotic) VALUES (?, ?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'autonomous_strategy_branch', ?, ?, ?, ?, ?, ?)`, ...workerInsertValues(details));
        const debit = await db.run(`UPDATE agents SET cognitive_budget = ROUND(MAX(0, COALESCE(cognitive_budget, 0) - ?), 6), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (cognitive_budget >= ? OR (? - cognitive_budget) < 0.0001)`, perWorkerCognitiveBudget, parent.id, perWorkerCognitiveBudget, perWorkerCognitiveBudget);
        if (debit.changes !== 1) {
          throw Object.assign(new Error(`Unable to debit inherited cognitive budget from orchestrator '${parent.id}'.`), { code: 'BUDGET_INHERITANCE_FAILURE' });
        }
        // Hypostatisation : enregistrer le worker comme entité autonome issue d'un attribut de l'orchestrateur
        const { hypostatize } = require('./ontologyHypostatization');
        const hypostasis = await hypostatize(parent.id, 'worker_capacity', {
          hypostasisType: 'worker_spawn',
          targetConfig: { id },
        });
        emit(parent.id, 'WORKER_HYPOSTATIZED', 'HYPOSTASIS', `Worker '${identity.name}' hypostatized from orchestrator '${parent.id}'.`, { workerId: id, hypostasisId: hypostasis.id, role: assignment.role }, 'info');
      });
      return;
    } catch (error) {
      if (error.code === 'BUDGET_INHERITANCE_FAILURE' && attempt < maxRetries) {
        const delay = 10 * Math.pow(2, attempt) + Math.random() * 5;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

function workerInsertValues(details) {
  const { id, identity, assignment, parent, route, conscience, prompt, assignedTokens } = details;
  return [id, identity.name, identity.name_meaning, assignment.role, parent.agent_type || 'GenOS', parent.workspace_id || null, parent.fleet_id || null, route.selectedModel || assignment.modelTier || parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', parent.id, `${identity.introduction} Budget round: initial; allocation: ${assignedTokens} tokens.`, prompt, conscience.dissonanceLevel, conscience.eurekaMoments, conscience.currentBudget, conscience.isApoptotic ? 1 : 0];
}

function formatWorker(details) {
  const { id, identity, assignment, parent, plan, mission, route, workspaceRoot, prompt, assignedTokens, index, evolution, orchestrator } = details;
  const capabilityContract = plan && plan.capabilityContract ? plan.capabilityContract.required : [];
  const toolLease = workerToolLeaseForCapabilities(assignment.role, capabilityContract);
  const assignmentList = details.assignments || plan?.dispatchWorkers || [];
  const worker = { ...workerIdentity({ id, identity, assignment, parent, plan, prompt }), ...workerRuntime({ parent, route, workspaceRoot, toolLease, assignments: assignmentList, mission }), executionPolicy: mission.executionPolicy, executionBudget: buildExecutionBudget({ executionBudget: mission.executionBudget, assignedTokens, index, assignmentCount: assignmentList.length || 1 }), orchestratorAgentId: parent.id, budgetRound: { stage: 'initial', orchestratorId: parent.id }, genome: evolution.genes, genomeRef: evolution.genomeRef, predictedFitness: evolution.predictedFitness };
  emit(orchestrator.id, 'WORKER_CAPABILITY_LEASED', 'LEASE', `Worker '${identity.name}' received ${toolLease.length} leased tools.`, { workerId: id, role: assignment.role, toolLease, runtimeMode: worker.localRuntime === true ? 'local' : 'supervised' }, 'info');
  return worker;
}

function workerIdentity(details) {
  const { id, identity, assignment, parent, plan, prompt } = details;
  return { agentId: id, label: assignment.label || id, name: identity.name, nameMeaning: identity.name_meaning, introduction: identity.introduction, role: assignment.role, prompt, branchAssignment: `${assignment.label}: ${assignment.hypothesis}`, artifact: assignment.artifact || plan.aTeam?.artifact || plan.trinity?.artifact || null, pipelineStage: Math.max(0, Number(assignment.pipelineStage || 0)), dependsOn: Array.isArray(assignment.dependsOn) ? assignment.dependsOn : [], modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode, workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type };
}

function inheritedWorkerEngine(mission) {
  if (!mission) return {};
  if (mission.localRuntime === true) return { localRuntime: true };
  if (String(mission.executor || mission.runtime || '').trim().toLowerCase() === 'local') return { localRuntime: true };
  return {};
}

function workerRuntime(details) {
  const { parent, route, workspaceRoot, toolLease, assignments, mission } = details;
  const inProcessWorker = config.inProcessWorkers() || (Array.isArray(assignments) && assignments.length > 12);
  return { workspaceRoot, workspaceProvisioned: true, inProcessWorker, localModel: route.selectedModel, localRoutingPolicy: route.policy, localRoutingCriteria: route.criteria, toolLease, workspaceIsolation: parent.isolation_mode, executor: mission.executor, provider: mission.provider, ...inheritedWorkerEngine(mission) };
}

function buildExecutionBudget(details) {
  const { executionBudget, assignedTokens, index, assignmentCount } = details;
  const costUsd = executionBudget?.costUsd === undefined ? undefined : Math.floor(Number(executionBudget.costUsd) * 1000000 / assignmentCount) / 1000000;
  const events = splitBudget(executionBudget?.events, index, assignmentCount);
  return { ...executionBudget, tokens: assignedTokens, ...allocatedBudgetFields(costUsd, events) };
}

function allocatedBudgetFields(costUsd, events) {
  return { ...(costUsd === undefined ? {} : { costUsd }), ...(events === undefined ? {} : { events }) };
}

function splitBudget(value, index, assignments) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const count = Math.max(1, Math.floor(assignments) || 1);
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const bonusSlots = Math.floor(remainder);
  const fractional = remainder - bonusSlots;
  // Whole remainder units go to the first workers; the inevitable fractional
  // residue is kept by the first worker. index === 0 also carries any remainder
  // so the split never sums above the available total.
  const bonus = index < bonusSlots ? 1 : 0;
  const extra = index === 0 ? fractional : 0;
  return Number((base + bonus + extra).toFixed(6));
}

'use strict';

/**
 * Cœur d'orchestration unifié GenOS.
 * Coordonne : orchestrateur, mission, tâche, run, job, worker, graphe d'états,
 * transitions, survivant, préféré, branches, stratégie, portfolio, adaptation,
 * contrats (méthode, stratégie, exécution, mission), sélection, arbitrage,
 * escalade, terminaison, reprise, retry, backoff+jitter, dead-letter, checkpoint,
 * WAL, rejeu causal, bisection causale, rollback atomique, restauration, capsule,
 * workspace contrefactuel, Git agentique, AgentGit, trajectoire, lignage,
 * campagne d'évaluation, benchmark, progressive delivery, chargeback.
 *
 * Ce module est un coordinateur sans E/S directe. Il délègue aux services
 * existants (executionLifecycle, stateMachine, retryUtils, methodContractService,
 * chargebackService, atomicRollbackService, strategyContractService, etc.).
 */

const { initialState, nextState, allowedEvents, isTerminal, canTransition } = require('./unifiedStateGraph');
const methodContract = require('./methodContractService');
const chargeback = require('./chargebackService');
const atomicRollback = require('./atomicRollbackService');
const strategyContract = require('./strategyContractService');
const { selectStrategyPortfolio } = require('../strategies/strategySelector');
const extensions = require('./orchestrationExtensions');

const SCHEMA = 'genos.orchestration-core/v1';

let counter = 0;
function genId() {
  counter += 1;
  return `genos-${Date.now()}-${counter}`;
}

function createOrchestrateur(input = {}) {
  return {
    schema: SCHEMA,
    kind: 'orchestrateur',
    id: input.id || genId(),
    nom: input.nom || 'orchestrateur-default',
    state: initialState('orchestrateur'),
    missions: [],
    budget: input.budget || { max_tokens: null, max_cost_usd: null },
    created_at: new Date().toISOString(),
    version: 1
  };
}

function activerOrchestrateur(orchestrateur) {
  if (orchestrateur.state !== 'INIT') {
    throw new Error('orchestrateur doit être en état INIT pour être activé');
  }
  return { ...orchestrateur, state: 'ACTIVE', version: orchestrateur.version + 1 };
}

function creerMission(orchestrateur, input = {}) {
  if (orchestrateur.state !== 'ACTIVE') {
    throw new Error('orchestrateur doit être ACTIVE pour créer une mission');
  }
  const mission = {
    schema: SCHEMA,
    kind: 'mission',
    id: input.id || genId(),
    orchestrateur_id: orchestrateur.id,
    nom: input.nom || 'mission',
    objectif: input.objectif || null,
    state: initialState('mission'),
    strategie: input.strategie || null,
    portfolio: input.portfolio || [],
    branches: input.branches || [],
    taches: [],
    runs: [],
    budget: input.budget || { max_tokens: null, max_cost_usd: null },
    survivant: null,
    preferable: null,
    contrat: null,
    created_at: new Date().toISOString(),
    version: 1
  };
  return { ...orchestrateur, missions: [...orchestrateur.missions, mission], mission };
}

function planifierMission(mission, plan = {}) {
  if (mission.state !== 'CREATED') {
    throw new Error('mission doit être en état CREATED pour être planifiée');
  }
  return {
    ...mission,
    state: 'PLANNING',
    strategie: plan.strategie || mission.strategie,
    portfolio: plan.portfolio || mission.portfolio,
    branches: plan.branches || mission.branches,
    version: mission.version + 1
  };
}

function creerTache(mission, input = {}) {
  if (mission.state !== 'PLANNING' && mission.state !== 'DISPATCHED') {
    throw new Error('mission doit être en état PLANNING ou DISPATCHED pour créer une tâche');
  }
  const tache = {
    schema: SCHEMA,
    kind: 'tache',
    id: input.id || genId(),
    mission_id: mission.id,
    nom: input.nom || 'tâche',
    state: initialState('tache'),
    worker_kind: input.worker_kind || null,
    method_contract: input.method_contract || null,
    budget: input.budget || {},
    created_at: new Date().toISOString()
  };
  return { ...mission, taches: [...mission.taches, tache], tache };
}

function verifierEtatTache(tache) {
  if (tache.state !== 'ASSIGNED' && tache.state !== 'RUNNING') {
    throw new Error('tâche doit être ASSIGNED ou RUNNING pour créer un run');
  }
}

function buildRun(input, tache) {
  return {
    schema: SCHEMA,
    kind: 'run',
    id: input.id ?? null,
    tache_id: tache.id,
    mission_id: tache.mission_id,
    state: initialState('run'),
    branches: input.branches ?? [],
    capsule: input.capsule ?? null,
    workspace_contrefactuel: input.workspace_contrefactuel ?? null,
    checkpoint: input.checkpoint ?? null,
    wal_head: input.wal_head ?? null,
    trajectoire: input.trajectoire ?? [],
    lignage: input.lignage ?? null,
    created_at: new Date().toISOString(),
    version: 1
  };
}

function creerRun(tache, input = {}) {
  verifierEtatTache(tache);
  const run = buildRun(input, tache);
  return { ...tache, runs: [...(tache.runs ?? []), run], run };
}

function creerJob(run, input = {}) {
  const job = {
    schema: SCHEMA,
    kind: 'job',
    id: input.id || genId(),
    run_id: run.id,
    mission_id: run.mission_id,
    state: initialState('job'),
    max_attempts: input.max_attempts || 3,
    attempts: 0,
    retryable: input.retryable !== false,
    dead_letter: false,
    created_at: new Date().toISOString()
  };
  return { ...run, jobs: [...(run.jobs || []), job], job };
}

function creerWorker(job, input = {}) {
  const worker = {
    schema: SCHEMA,
    kind: 'worker',
    id: input.id || genId(),
    job_id: job.id,
    mission_id: job.mission_id,
    state: initialState('worker'),
    worker_kind: input.worker_kind || 'bounded_worker',
    is_survivant: input.is_survivant || false,
    is_preferable: input.is_preferable || false,
    method_contract: input.method_contract || null,
    created_at: new Date().toISOString()
  };
  return { ...job, workers: [...(job.workers || []), worker], worker };
}

function lierContratMethode(worker, contratInput = {}) {
  const contrat = methodContract.buildMethodContract(contratInput);
  const bound = methodContract.bindMethodContract(contrat, {});
  return { ...worker, method_contract: bound, state: worker.state === 'INCARNATED' ? 'BOUND' : worker.state };
}

function executerContratMethode(worker, context = {}) {
  if (!worker.method_contract) {
    throw new Error('worker doit avoir un contrat de méthode lié avant exécution');
  }
  const result = methodContract.executeMethodContract(worker.method_contract, context);
  return { ...worker, method_contract: result.contract, execution_result: result.result };
}

function lierContratStrategie(mission, contratInput = {}) {
  const contrat = strategyContract.buildStrategyContract(contratInput);
  return { ...mission, contrat, state: 'PLANNING' };
}

function selectionnerStrategie(mission, criteres = {}) {
  const selection = selectStrategyPortfolio(criteres);
  return {
    ...mission,
    strategie: selection.primary ? selection.primary.id : null,
    portfolio: selection.portfolio || [],
    version: mission.version + 1
  };
}

function marquerSurvivant(worker) {
  if (worker.state !== 'EVIDENCE' && worker.state !== 'EXECUTING') {
    throw new Error('worker doit être en état EXECUTING ou EVIDENCE pour être marqué survivant');
  }
  return { ...worker, is_survivant: true, state: 'SURVIVOR' };
}

function marquerPreferable(worker) {
  return { ...worker, is_preferable: true };
}

function terminerMission(mission, motif = 'complete') {
  if (isTerminal('mission', mission.state)) {
    throw new Error('mission déjà terminée');
  }
  return { ...mission, state: motif === 'complete' ? 'TERMINATED' : 'FAILED', version: mission.version + 1 };
}

function escalader(mission, raison) {
  return {
    ...mission,
    escalade: { raison, timestamp: new Date().toISOString() },
    state: 'FAILED',
    version: mission.version + 1
  };
}

function reprendre(mission, plan = {}) {
  if (mission.state !== 'FAILED' && mission.state !== 'TERMINATED') {
    throw new Error('seule une mission FAILED ou TERMINATED peut être reprise');
  }
  return {
    ...mission,
    state: 'PLANNING',
    reprise: { plan, timestamp: new Date().toISOString() },
    version: mission.version + 1
  };
}

function creerChargeback(mission, input = {}) {
  return chargeback.buildChargeback({
    ...input,
    missionId: mission.id,
    chargebackId: input.chargebackId || `cb-${mission.id}`
  });
}

function ajouterLigneChargeback(chargebackObj, item) {
  return chargeback.addLineItem(chargebackObj, item);
}

function reglerChargeback(chargebackObj) {
  const settled = chargeback.settleChargeback(chargebackObj);
  const receipt = chargeback.buildReceipt(settled);
  return { chargeback: settled, receipt };
}

function creerPlanRollbackAtomique(mission, input = {}) {
  return atomicRollback.buildAtomicRollbackPlan({
    ...input,
    missionId: mission.id,
    planId: input.planId || `rb-${mission.id}`
  });
}

function commettreRollbackAtomique(plan) {
  return atomicRollback.commitAtomicRollback(plan);
}

function effectuerRollbackAtomique(plan) {
  return atomicRollback.rollbackAtomic(plan);
}

function executerAvecRetry(params) {
  const { db, table, job, executor } = params;
  return withRetry({ db, table, job, executor });
}

function ajouterBranche(mission, hypothese, budgetShare) {
  return {
    ...mission,
    branches: [...mission.branches, { hypothese, budget_share: budgetShare || 0, isolation: 'agent_world_capsule' }],
    version: mission.version + 1
  };
}

function lierCapsule(run, capsuleId) {
  return { ...run, capsule: capsuleId };
}

function lierWorkspaceContrefactuel(run, workspaceId) {
  return { ...run, workspace_contrefactuel: workspaceId };
}

function lierCheckpoint(run, checkpointId) {
  return { ...run, checkpoint: checkpointId };
}

function lierWalHead(run, walHead) {
  return { ...run, wal_head: walHead };
}

function lierTrajectoire(run, étape) {
  return { ...run, trajectoire: [...run.trajectoire, étape] };
}

function lierLignage(run, lignageId) {
  return { ...run, lignage: lignageId };
}

module.exports = {
  SCHEMA,
  createOrchestrateur,
  activerOrchestrateur,
  creerMission,
  planifierMission,
  creerTache,
  creerRun,
  creerJob,
  creerWorker,
  lierContratMethode,
  executerContratMethode,
  lierContratStrategie,
  selectionnerStrategie,
  marquerSurvivant,
  marquerPreferable,
  terminerMission,
  escalader,
  reprendre,
  creerChargeback,
  ajouterLigneChargeback,
  reglerChargeback,
  creerPlanRollbackAtomique,
  commettreRollbackAtomique,
  effectuerRollbackAtomique,
  ajouterBranche,
  lierCapsule,
  lierWorkspaceContrefactuel,
  lierCheckpoint,
  lierWalHead,
  lierTrajectoire,
  lierLignage,
  ...extensions,
  initialState,
  nextState,
  allowedEvents,
  isTerminal,
  canTransition
};

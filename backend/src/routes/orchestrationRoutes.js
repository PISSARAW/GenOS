const express = require('express');
const core = require('../services/orchestrationCore');

const router = express.Router();

// Orchestrateur
router.post('/orchestrateurs', (req, res) => {
  try {
    const o = core.createOrchestrateur(req.body || {});
    res.status(201).json({ ok: true, orchestrateur: o });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ORCHESTRATEUR_INVALID' });
  }
});

router.post('/orchestrateurs/:id/activer', (req, res) => {
  try {
    const o = { ...req.body, id: req.params.id, state: 'INIT' };
    const active = core.activerOrchestrateur(o);
    res.json({ ok: true, orchestrateur: active });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ORCHESTRATEUR_ACTIVER_FAILED' });
  }
});

// Mission
router.post('/orchestrateurs/:id/missions', (req, res) => {
  try {
    const o = { id: req.params.id, state: 'ACTIVE', missions: [] };
    const { mission } = core.creerMission(o, req.body || {});
    res.status(201).json({ ok: true, mission });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_CREATION_FAILED' });
  }
});

router.post('/missions/:id/planifier', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, state: 'CREATED' };
    const plan = core.planifierMission(m, req.body.plan || {});
    res.json({ ok: true, mission: plan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_PLANIFIER_FAILED' });
  }
});

router.post('/missions/:id/strategie', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, state: 'CREATED', strategie: null, portfolio: [] };
    const selected = core.selectionnerStrategie(m, req.body.criteres || {});
    res.json({ ok: true, mission: selected });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_STRATEGIE_FAILED' });
  }
});

router.post('/missions/:id/contrat-strategie', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, state: 'CREATED', contrat: null };
    const withContract = core.lierContratStrategie(m, req.body.contrat || {});
    res.json({ ok: true, mission: withContract });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_CONTRAT_STRATEGIE_FAILED' });
  }
});

router.post('/missions/:id/branches', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, branches: [] };
    const withBranch = core.ajouterBranche(m, req.body.hypothese, req.body.budget_share);
    res.json({ ok: true, mission: withBranch });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_BRANCHE_FAILED' });
  }
});

router.post('/missions/:id/terminer', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, state: 'EXECUTING' };
    const terminated = core.terminerMission(m, req.body.motif);
    res.json({ ok: true, mission: terminated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_TERMINER_FAILED' });
  }
});

router.post('/missions/:id/escalader', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, state: 'EXECUTING' };
    const escalated = core.escalader(m, req.body.raison);
    res.json({ ok: true, mission: escalated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_ESCALADER_FAILED' });
  }
});

router.post('/missions/:id/reprendre', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.id, state: 'FAILED' };
    const resumed = core.reprendre(m, req.body.plan || {});
    res.json({ ok: true, mission: resumed });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'MISSION_REPRENDRE_FAILED' });
  }
});

// Tâche
router.post('/missions/:missionId/taches', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.missionId, state: 'PLANNING', taches: [] };
    const { tache } = core.creerTache(m, req.body || {});
    res.status(201).json({ ok: true, tache });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'TACHE_CREATION_FAILED' });
  }
});

// Run
router.post('/taches/:tacheId/runs', (req, res) => {
  try {
    const t = { ...req.body, id: req.params.tacheId, state: 'ASSIGNED', runs: [] };
    const { run } = core.creerRun(t, req.body || {});
    res.status(201).json({ ok: true, run });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_CREATION_FAILED' });
  }
});

// Job
router.post('/runs/:runId/jobs', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, jobs: [] };
    const { job } = core.creerJob(r, req.body || {});
    res.status(201).json({ ok: true, job });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'JOB_CREATION_FAILED' });
  }
});

// Worker
router.post('/jobs/:jobId/workers', (req, res) => {
  try {
    const j = { ...req.body, id: req.params.jobId, workers: [] };
    const { worker } = core.creerWorker(j, req.body || {});
    res.status(201).json({ ok: true, worker });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'WORKER_CREATION_FAILED' });
  }
});

// Contrat de méthode
router.post('/workers/:workerId/contrat-methode', (req, res) => {
  try {
    const w = { ...req.body, id: req.params.workerId, state: 'INCARNATED', method_contract: null };
    const bound = core.lierContratMethode(w, req.body.contrat || {});
    res.json({ ok: true, worker: bound });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'WORKER_CONTRAT_METHODE_FAILED' });
  }
});

router.post('/workers/:workerId/contrat-methode/executer', (req, res) => {
  try {
    const w = { ...req.body, id: req.params.workerId, method_contract: { schema: 'genos.method-contract/v1', status: 'bound', method_id: 'm1', version: 1, preconditions: [] } };
    const result = core.executerContratMethode(w, req.body.context || {});
    res.json({ ok: true, worker: result.worker, execution_result: result.execution_result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'WORKER_CONTRAT_EXECUTER_FAILED' });
  }
});

// Survivant / Préféré
router.post('/workers/:workerId/survivant', (req, res) => {
  try {
    const w = { ...req.body, id: req.params.workerId, state: 'EVIDENCE', is_survivant: false };
    const s = core.marquerSurvivant(w);
    res.json({ ok: true, worker: s });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'WORKER_SURVIVANT_FAILED' });
  }
});

router.post('/workers/:workerId/preferable', (req, res) => {
  try {
    const w = { ...req.body, id: req.params.workerId };
    const p = core.marquerPreferable(w);
    res.json({ ok: true, worker: p });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'WORKER_PREFERABLE_FAILED' });
  }
});

// Chargeback
router.post('/missions/:missionId/chargeback', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.missionId };
    const cb = core.creerChargeback(m, req.body || {});
    res.status(201).json({ ok: true, chargeback: cb });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_CREATION_FAILED' });
  }
});

router.post('/chargeback/:id/ligne', (req, res) => {
  try {
    const cb = { ...req.body, id: req.params.id, schema: 'genos.chargeback/v1', status: 'open', lineItems: [], total_amount_usd: 0 };
    const updated = core.ajouterLigneChargeback(cb, req.body.item || {});
    res.json({ ok: true, chargeback: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_LIGNE_FAILED' });
  }
});

router.post('/chargeback/:id/regler', (req, res) => {
  try {
    const cb = { ...req.body, id: req.params.id, schema: 'genos.chargeback/v1', status: 'open', lineItems: [], total_amount_usd: 0 };
    const result = core.reglerChargeback(cb);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_REGLE_FAILED' });
  }
});

// Rollback atomique
router.post('/missions/:missionId/rollback/plan', (req, res) => {
  try {
    const m = { ...req.body, id: req.params.missionId };
    const plan = core.creerPlanRollbackAtomique(m, req.body || {});
    res.status(201).json({ ok: true, plan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ROLLBACK_PLAN_FAILED' });
  }
});

router.post('/rollback/plans/:id/commettre', (req, res) => {
  try {
    const plan = { ...req.body, id: req.params.id, schema: 'genos.atomic-rollback/v1', status: 'prepared', operations: [], invariants: [] };
    const result = core.commettreRollbackAtomique(plan);
    if (!result.ok) {
      return res.status(409).json({ ok: false, reason: result.reason, code: 'ROLLBACK_COMMIT_BLOCKED' });
    }
    res.json({ ok: true, plan: result.plan, receipt: result.receipt });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ROLLBACK_COMMIT_FAILED' });
  }
});

router.post('/rollback/plans/:id/effectuer', (req, res) => {
  try {
    const plan = { ...req.body, id: req.params.id, schema: 'genos.atomic-rollback/v1', status: 'prepared', operations: [], invariants: [] };
    const result = core.effectuerRollbackAtomique(plan);
    res.json({ ok: true, plan: result.plan, compensation_operations: result.compensation_operations });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ROLLBACK_FAILED' });
  }
});

// Capsule / Workspace contrefactuel / Checkpoint / WAL / Trajectoire / Lignage
router.post('/runs/:runId/capsule', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, capsule: null };
    const updated = core.lierCapsule(r, req.body.capsule_id);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_CAPSULE_FAILED' });
  }
});

router.post('/runs/:runId/workspace-contrefactuel', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, workspace_contrefactuel: null };
    const updated = core.lierWorkspaceContrefactuel(r, req.body.workspace_id);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_WORKSPACE_CONTREFACTUEL_FAILED' });
  }
});

router.post('/runs/:runId/checkpoint', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, checkpoint: null };
    const updated = core.lierCheckpoint(r, req.body.checkpoint_id);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_CHECKPOINT_FAILED' });
  }
});

router.post('/runs/:runId/wal-head', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, wal_head: null };
    const updated = core.lierWalHead(r, req.body.wal_head);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_WAL_HEAD_FAILED' });
  }
});

router.post('/runs/:runId/trajectoire', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, trajectoire: [] };
    const updated = core.lierTrajectoire(r, req.body.etape || {});
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_TRAJECTOIRE_FAILED' });
  }
});

router.post('/runs/:runId/lignage', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId, lignage: null };
    const updated = core.lierLignage(r, req.body.lignage_id);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'RUN_LIGNAGE_FAILED' });
  }
});

// Extensions : dead-letter, rejeu causal, bisection, campagne, benchmark, progressive delivery
router.post('/jobs/:jobId/dead-letter', (req, res) => {
  try {
    const j = { ...req.body, id: req.params.jobId, state: 'RUNNING', dead_letter: false };
    const updated = core.deadLetterJob(j, req.body.raison);
    res.json({ ok: true, job: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'JOB_DEAD_LETTER_FAILED' });
  }
});

router.post('/runs/:runId/rejeu-causal', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId };
    const updated = core.rejeuCausal(r, req.body.trace_id);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'REJEU_CAUSAL_FAILED' });
  }
});

router.post('/runs/:runId/bisection-causale', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId };
    const updated = core.bisectionCausale(r, req.body.intervalle || [0, 1]);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'BISECTION_CAUSAL_FAILED' });
  }
});

router.post('/campagnes-evaluation', (req, res) => {
  try {
    const campagne = core.creerCampagneEvaluation(req.body || {});
    res.status(201).json({ ok: true, campagne });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CAMPAGNE_CREATION_FAILED' });
  }
});

router.post('/benchmarks', (req, res) => {
  try {
    const benchmark = core.creerBenchmark(req.body || {});
    res.status(201).json({ ok: true, benchmark });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'BENCHMARK_CREATION_FAILED' });
  }
});

router.post('/runs/:runId/progressive-delivery', (req, res) => {
  try {
    const r = { ...req.body, id: req.params.runId };
    const updated = core.progressiveDelivery(r, req.body.canal);
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'PROGRESSIVE_DELIVERY_FAILED' });
  }
});

// État / transitions
router.get('/etat/:kind/:state/transitions', (req, res) => {
  const { kind, state } = req.params;
  const events = core.allowedEvents(kind, state);
  res.json({ ok: true, kind, state, allowed_events: events });
});

router.get('/etat/:kind/:from/:to/possible', (req, res) => {
  const { kind, from, to } = req.params;
  const possible = core.canTransition(kind, from, to);
  res.json({ ok: true, kind, from, to, possible });
});

module.exports = router;

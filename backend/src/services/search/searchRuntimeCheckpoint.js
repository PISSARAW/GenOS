const { captureModules, applyModules, restoreModuleStates } = require('./moduleStatePersistence');
const { validateCheckpoint } = require('./searchStateCodec');

function captureCheckpoint(state) {
  const { window, ...totals } = state.causalProgress;
  return JSON.parse(JSON.stringify({
    agentId: state.agentId, ledger: state.ledger.save(), modules: captureModules(state),
    stepCount: state.stepCount, lastProgressStep: state.lastProgressStep,
    control: { lastProcess: state.controller.lastProcess, stepsSinceChange: state.controller.stepsSinceChange,
      stepsInCurrentProcess: state.controller.stepsInCurrentProcess, history: state.controller.history,
      lastEvolutionLineageCount: state.controller.lastEvolutionLineageCount,
      pressureModel: { ...state.controller.pressureModel } },
    sensor: { totals, steps: window.steps, budgets: window.budgets, objectiveStart: window.objectiveStart },
    causalEvents: state.causalEvents, receipts: state.actuator.getReceipts()
  }));
}

function applyCheckpoint(state, saved) {
  validateCheckpoint(saved);
  state.ledger.load(saved.ledger);
  applyModules(state, saved.modules);
  state.stepCount = saved.stepCount;
  state.lastProgressStep = saved.lastProgressStep;
  for (const key of ['lastProcess', 'stepsSinceChange', 'stepsInCurrentProcess', 'history', 'lastEvolutionLineageCount']) {
    state.controller[key] = saved.control[key];
  }
  for (const key of Object.keys(state.controller.pressureModel)) state.controller.pressureModel[key] = saved.control.pressureModel[key];
  for (const key of Object.keys(state.causalProgress).filter(name => name !== 'window')) {
    state.causalProgress[key] = saved.sensor.totals[key];
  }
  const window = state.causalProgress.window;
  window.steps = saved.sensor.steps.filter(step => step.ts >= Date.now() - window.windowMs);
  window.budgets = saved.sensor.budgets;
  window.objectiveStart = saved.sensor.objectiveStart;
  state.causalEvents = saved.causalEvents;
  state.actuator.receipts = saved.receipts || [];
}

async function flushCheckpoint(state) {
  const p = state.persistence;
  if (!p.db) throw new Error('Natural Search durable storage unavailable');
  const saved = captureCheckpoint(state);
  validateCheckpoint(saved);
  // History projections may be partially written on failure. Recovery uses the atomic checkpoint.
  for (const h of saved.ledger.hypotheses) await p.saveHypothesis(h);
  for (const proof of saved.ledger.proofs) await p.saveProof(proof);
  const pressure = saved.control.pressureModel;
  await p.savePressureState(state.agentId, { ...pressure, stepCount: saved.stepCount, lastProgressStep: saved.lastProgressStep });
  await p.saveModuleStates(state.agentId, saved.modules);
  await p.saveRuntimeCheckpoint(state.agentId, saved);
}

async function restoreCheckpoint(state) {
  const saved = await state.persistence.loadRuntimeCheckpoint(state.agentId);
  if (saved) return applyCheckpoint(state, saved);
  await restoreLegacyLedger(state);
  await restoreModuleStates(state.agentId, state);
}

async function restoreLegacyLedger(state) {
  const p = state.persistence;
  const [rows, proofs, pressure] = await Promise.all([
    p.loadHypothesesForAgent(state.agentId), p.loadProofsForAgent(state.agentId), p.loadPressureState(state.agentId)
  ]);
  state.ledger.load({ hypotheses: rows.map(row => ({ ...row, agentId: row.agent_id,
    parentHypothesisId: row.parent_hypothesis_id, branchId: row.branch_id,
    falsificationCondition: row.falsification_condition, createdAt: row.created_at,
    lastTestedAt: row.last_tested_at, lastProgressAt: row.last_progress_at })),
  proofs: proofs.map(row => ({ ...row, hypothesisId: row.hypothesis_id, evidenceRef: row.evidence_ref,
    receiptRef: row.receipt_ref, sourceAgent: row.source_agent, sourceTool: row.source_tool,
    createdAt: row.created_at, independent: row.independent === 1 })) });
  if (!pressure) return;
  state.stepCount = pressure.step_count;
  state.lastProgressStep = pressure.last_progress_step;
}

async function receiveCulture(state) {
  const scope = await state.persistence.getAgentScope(state.agentId);
  const culture = state.actuator.modules.cultureService;
  for (const [id, item] of culture.received) {
    if (item.organizationId !== scope.organization_id || item.projectId !== scope.project_id) culture.received.delete(id);
  }
  const incoming = await state.persistence.loadIncomingCulture(state.agentId);
  for (const item of incoming) culture.receive(item, state.agentId);
}

module.exports = { captureCheckpoint, applyCheckpoint, flushCheckpoint, restoreCheckpoint, receiveCulture };

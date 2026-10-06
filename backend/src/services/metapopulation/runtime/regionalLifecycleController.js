'use strict';

const recovery = require('../demes/demeRecoveryService');
const recolonization = require('../patches/recolonizationService');
const store = require('../metapopulationStore');

async function planLifecycleActions(context, plan) {
  const { observed, input, options } = context;
  for (const report of input.extinctionReports || []) {
    const deme = observed.demes.find((item) => item.demeId === report.demeId);
    if (deme && deme.status !== 'COLLAPSED' && recovery.assessExtinction(report.evidence).status === 'EXTINCT') {
      plan.actions.push({ type: 'REPORT_LOCAL_EXTINCTION', demeId: deme.demeId, report });
    }
  }
  if (typeof options.evaluateColonization !== 'function') return;
  const trials = await options.db.all(`SELECT colonization_id, patch_id FROM metapopulation_colonizations
    WHERE metapopulation_id = ? AND status = 'IN_TRIAL' ORDER BY started_at, colonization_id`, input.metapopulationId);
  for (const trial of trials) plan.actions.push({ type: 'EVALUATE_COLONIZATION_TRIAL',
    colonizationId: trial.colonization_id, patchId: trial.patch_id });
}

async function executeLifecycleAction(action, context) {
  if (action.type === 'REPORT_LOCAL_EXTINCTION') {
    const outcome = await recovery.reportDemeFailure({ ...action.report,
      metapopulationId: context.input.metapopulationId, demeId: action.demeId }, context.options);
    return { type: action.type, demeId: action.demeId, ...outcome };
  }
  if (action.type !== 'EVALUATE_COLONIZATION_TRIAL') return null;
  const { input, options } = context;
  const trial = await options.db.get(`SELECT * FROM metapopulation_colonizations
    WHERE metapopulation_id = ? AND colonization_id = ? AND status = 'IN_TRIAL'`,
  input.metapopulationId, action.colonizationId);
  if (!trial) throw lifecycleError('METAPOPULATION_COLONIZATION_NOT_PENDING');
  const patch = await store.getPatch(options.db, input.metapopulationId, trial.patch_id);
  const evidence = await options.evaluateColonization({ metapopulationId: input.metapopulationId,
    colonizationId: action.colonizationId, patch, founders: JSON.parse(trial.founder_lineages_json),
    seed: input.seed, idempotencyKey: action.colonizationId });
  if (evidence?.pending === true) return { type: action.type, colonizationId: action.colonizationId, status: 'IN_TRIAL' };
  const result = await recolonization.finishColonizationTrial({ metapopulationId: input.metapopulationId,
    colonizationId: action.colonizationId, evidence }, options);
  return { type: action.type, ...result };
}

async function verifyLifecycleActions(context) {
  const actions = context.plan.actions.filter((action) =>
    ['REPORT_LOCAL_EXTINCTION', 'EVALUATE_COLONIZATION_TRIAL'].includes(action.type));
  for (const action of actions) {
    if (!await verifyLifecycleAction(action, context)) return false;
  }
  return true;
}

async function verifyLifecycleAction(action, context) {
  const { input, options } = context;
  const result = context.execution.results.find((item) => item.type === action.type
    && (action.demeId ? item.demeId === action.demeId : item.colonizationId === action.colonizationId));
  if (!result) return false;
  if (action.type === 'REPORT_LOCAL_EXTINCTION') {
    const deme = await store.getDeme(options.db, input.metapopulationId, action.demeId);
    const history = await recovery.listDemeExtinctions({ metapopulationId: input.metapopulationId,
      demeId: action.demeId }, options);
    return result.recorded === true && deme?.status === 'COLLAPSED'
      && history.some((item) => item.extinctionId === result.extinction?.extinctionId);
  }
  const trial = await options.db.get(`SELECT status, deme_id FROM metapopulation_colonizations
    WHERE metapopulation_id = ? AND colonization_id = ?`, input.metapopulationId, action.colonizationId);
  return trial?.status === result.status;
}

function lifecycleError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { planLifecycleActions, executeLifecycleAction, verifyLifecycleActions };

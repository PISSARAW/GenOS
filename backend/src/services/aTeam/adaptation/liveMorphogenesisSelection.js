'use strict';

const automatic = require('./liveMorphogenesisAutomaticPolicy');
const evidence = require('./liveMorphogenesisEvidence');
const store = require('../teamRunStore');
const preparation = require('./liveMorphogenesisPreparation');

async function select(input) {
  if (input.run.execution.liveMorphogenesis.status === 'SELECTED') return reserve(input.db, input.run);
  if ([...input.observed.statuses.values()].some(status => status === 'running')) return null;
  for (const pair of automatic.pairs(input.run.members)) {
    if (!input.observed.verdicts.get(pair.source.workerId)?.promoted) continue;
    const quality = await evidence.sourceQuality(input.db, input.run, pair.source);
    if (!evidence.triggered(quality) || !await pending(input, pair.target)) continue;
    const run = await store.update({ db: input.db, teamRunId: input.run.teamRunId, revision: input.run.revision,
      patch: { execution: { ...input.run.execution, liveMorphogenesis: {
        status: 'SELECTED', selection: automatic.selection(pair), triggerReceiptId: quality.receiptId
      } } } });
    return reserve(input.db, run);
  }
  return null;
}

async function reserve(db, run) {
  const controller = await preparation.controllerScope(db, run);
  return preparation.prepare({ db, run, parent: { workspace_id: controller.workspace_id } });
}

async function pending(input, target) {
  const nodes = input.observed.graph.nodes.filter(node => node.memberId === target.memberId);
  if (!nodes.length || nodes.some(node => !['READY', 'PENDING'].includes(node.status))) return false;
  try { await preparation.assertPending(input.db, input.run, target.workerId); return true; }
  catch (error) {
    if (['ATEAM_LIVE_MORPH_MEMBER_ACTIVE', 'ATEAM_LIVE_MORPH_MEMBER_STARTED'].includes(error.code)) return false;
    throw error;
  }
}

module.exports = { select };

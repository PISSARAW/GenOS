'use strict';

const { getDatabase, closeDatabase } = require('../../src/db');
const execution = require('../../src/services/strategyExecutionService');
const journal = require('../../src/services/promotionExecutionJournal');
const gate = require('../../src/services/strategyPromotionGate');

function crash(input) {
  require('node:fs').writeFileSync(input.marker, input.crash);
  process.kill(process.pid, 'SIGKILL');
}

async function main() {
  const input = JSON.parse(process.argv[2]);
  const db = await getDatabase(input.filename);
  if (input.barrier) {
    const reserve = journal.reserve;
    journal.reserve = async (...args) => {
      process.send({ ready: true });
      await new Promise(resolve => process.once('message', resolve));
      return reserve(...args);
    };
  }
  if (input.crash === 'in_effect') {
    const handlers = require('../../src/services/primitiveHandlers/handlersRegistry').HANDLERS;
    const goldenPath = handlers.cherry_pick_golden_path;
    handlers.cherry_pick_golden_path = async context => {
      await goldenPath(context);
      crash(input);
    };
  }
  if (input.crash === 'after_pipeline') gate.applyPostPromotion = async () => crash(input);
  if (input.crash === 'in_finalization') {
    const finalize = gate.finalizePromotion;
    gate.finalizePromotion = async (...args) => { await finalize(...args); crash(input); };
  }
  if (input.crash === 'after_merge') {
    const recovery = require('../../src/services/promotionWorkspaceRecovery');
    const apply = recovery.apply;
    recovery.apply = async spec => { await apply(spec); crash(input); };
  }
  if (input.crash === 'partial_merge') {
    const fs = require('node:fs').promises;
    const rename = fs.rename;
    fs.rename = async (source, target) => {
      await rename(source, target);
      if (source.includes('.genos-promotion-')) crash(input);
    };
  }
  try {
    const result = await execution.approveRun(db, input.runId, input.options);
    if (input.crash === 'after_commit') crash(input);
    if (process.send) process.send({ status: result.status });
    console.log(JSON.stringify({ status: result.status }));
  } finally { await closeDatabase(); }
}

main().catch(error => {
  if (process.send) process.send({ error: error.message });
  console.error(error.message);
  process.exitCode = 1;
});

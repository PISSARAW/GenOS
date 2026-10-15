'use strict';

// Execute une seule tentative de regime et consigne le recu + la duree.
// Usage: node benchmarks/topology-morphogenesis/run-single-regime-attempt.cjs <taskId> <topology|adaptive> <outDir>

const fs = require('fs');
const path = require('path');
const { executeCondition } = require('./comparisonAdapters.cjs');
const { verifyRegimeCandidate } = require('./holdout-oracles/regime-change-oracles.cjs');

async function main() {
  const [taskId, topology, outDir] = process.argv.slice(2);
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'regime-change-plan.json'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, plan.taskSetFile), 'utf8'));
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  const condition = topology === 'adaptive'
    ? { id: 'genos-adaptive', adapter: 'genos-full', autonomous: true, morphogenesisPolicy: { adaptive: true } }
    : { id: 'training-fixed', adapter: 'genos-full', autonomous: true, topology, morphogenesisPolicy: { adaptive: false } };
  const workspace = path.join(outDir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const context = { tokens: plan.executionBudget.tokens, latencyMs: plan.executionBudget.latencyMs,
    minimumWorkerTokens: plan.executionBudget.minimumWorkerTokens,
    workerShare: plan.executionBudget.workerShare, model: plan.model, seed: plan.seeds[0],
    workspace, dbPath: path.join(outDir, 'mission.db') };
  const started = Date.now();
  const result = await executeCondition(condition, task, context);
  const elapsed = Date.now() - started;
  const oracle = result.candidate ? verifyRegimeCandidate(task, result.candidate) : { passed: false };
  const report = { taskId, topology, elapsedMs: elapsed, oraclePassed: oracle.passed,
    tokenUsage: result.tokenUsage, servedModel: result.servedModel, error: result.error || null,
    transitionEvidence: result.transitionEvidence || null, candidate: result.candidate };
  fs.writeFileSync(path.join(outDir, 'attempt.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'receipt.json'), JSON.stringify(result.receipt || null).slice(0, 2000000));
  process.stdout.write(`${JSON.stringify({ elapsedMs: elapsed, oraclePassed: oracle.passed, error: report.error })}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });

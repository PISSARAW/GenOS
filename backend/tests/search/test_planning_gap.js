/**
 * Test décisif planning-gap : même budget, même modèle du monde.
 * ReAct / ToT / MCTS / GenOS sur Blocksworld + TrapChain long-horizon.
 */
const assert = require('node:assert/strict');
const Domain = require('../../src/services/search/planningGapDomain');
const Policies = require('../../src/services/search/planningGapPolicies');

const BUDGET = 120;
const MAX_STEPS = 14;

function runOne(task) {
  const react = Policies.reactPolicy(task, BUDGET, MAX_STEPS);
  const tot = Policies.totPolicy(task, BUDGET, 3);
  const mcts = Policies.mctsPolicy(task, BUDGET, 6);
  const genos = Policies.genosPolicy(task, BUDGET, 'gap');
  return { task: task.id, domain: task.domain, react, tot, mcts, genos };
}

function verifyIndependently(task, plan) {
  if (task.domain === 'blocksworld') return Domain.verifyBlockworld(task, plan);
  return Domain.verifyTrap(task, plan);
}

function checkBudget(results) {
  for (const r of results) {
    assert.ok(r.react.expansions <= BUDGET, 'react budget');
    assert.ok(r.tot.expansions <= BUDGET, 'tot budget');
    assert.ok(r.mcts.expansions <= BUDGET, 'mcts budget');
    assert.ok(r.genos.expansions <= BUDGET, 'genos budget');
  }
}

function checkNoFakeSuccess(results, tasks) {
  for (let i = 0; i < results.length; i += 1) {
    const task = tasks[i];
    const r = results[i];
    for (const key of ['react', 'tot', 'mcts', 'genos']) {
      const v = verifyIndependently(task, r[key].plan);
      assert.equal(r[key].valid, v.valid, `${r.task}/${key} verifier`);
    }
  }
}

function summarize(results) {
  const stats = {};
  for (const key of ['react', 'tot', 'mcts', 'genos']) {
    const wins = results.filter((r) => r[key].valid).length;
    const avg = results.reduce((a, r) => a + r[key].expansions, 0) / results.length;
    stats[key] = { success: wins, total: results.length, avgExpansions: Number(avg.toFixed(1)) };
  }
  return stats;
}

function printTable(results, stats) {
  console.log('=== Planning-gap : même budget, même modèle du monde ===');
  console.log(`Budget=${BUDGET} expansions | tâches=${results.length}\n`);
  for (const r of results) {
    const line = [r.task, `react:${r.react.valid ? 1 : 0}`, `tot:${r.tot.valid ? 1 : 0}`];
    line.push(`mcts:${r.mcts.valid ? 1 : 0}`, `genos:${r.genos.valid ? 1 : 0}`);
    console.log(line.join(' | '));
  }
  console.log('\n--- Synthèse ---');
  for (const key of ['react', 'tot', 'mcts', 'genos']) {
    console.log(`${key}: ${stats[key].success}/${stats[key].total} | moy expansions=${stats[key].avgExpansions}`);
  }
}

function checkGenosInstrumentation(results) {
  const used = results.some((r) => (r.genos.ledgerSize || 0) > 0);
  assert.ok(used, 'GenOS doit utiliser le ledger');
  const pressured = results.some((r) => (r.genos.pressure || 0) > 0);
  assert.ok(pressured, 'GenOS doit mesurer une pression');
}

function optimalLength(task) {
  if (task.domain !== 'blocksworld') return null;
  const opt = Domain.bfsOptimal(task, 5000);
  return opt ? opt.length : null;
}

function printOptimalRow(id, opt, row) {
  const parts = [id, `opt:${opt}`];
  for (const key of ['react', 'tot', 'mcts', 'genos']) {
    parts.push(`${key}:${row[key].valid ? row[key].plan.length : 'X'}`);
  }
  console.log(parts.join(' | '));
}

function reportOptimality(results, tasks) {
  console.log('\n--- Longueur vs optimal BFS (blocksworld) ---');
  for (let i = 0; i < results.length; i += 1) {
    const opt = optimalLength(tasks[i]);
    if (opt === null) continue;
    printOptimalRow(tasks[i].id, opt, results[i]);
  }
}

function checkMyopiaExists(results) {
  const trap = results.find((r) => !r.react.valid && (r.tot.valid || r.mcts.valid || r.genos.valid));
  assert.ok(trap, 'Au moins une tâche doit piéger le glouton myope pendant qu\'une recherche globale réussit');
  console.log(`\nMyopie démontrée sur : ${trap.task}`);
}

function runPlanningGap() {
  const tasks = Domain.buildTasks();
  assert.ok(tasks.length >= 10, 'benchmark long-horizon >= 10 tâches');
  const sanity = Domain.verifyBlockworld(tasks[0], ['stack X on Y']);
  assert.equal(sanity.valid, false, 'verificateur doit rejeter plan illegal');
  const results = tasks.map((t) => runOne(t));
  checkBudget(results);
  checkNoFakeSuccess(results, tasks);
  checkGenosInstrumentation(results);
  const stats = summarize(results);
  printTable(results, stats);
  reportOptimality(results, tasks);
  checkMyopiaExists(results);
  console.log('\n=== PLANNING-GAP PASSED (harness valide, succès non truqué) ===');
  return { results, stats };
}

if (require.main === module) {
  try {
    runPlanningGap();
  } catch (err) {
    console.error('PLANNING-GAP FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { runPlanningGap, BUDGET };

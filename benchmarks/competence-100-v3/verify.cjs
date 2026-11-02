'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const corpus = require('../competence-100/corpus.cjs');
const oracle = require('../competence-100/oracle.cjs');
const statistics = require('../competence-100/statistics.cjs');
const legacyVerifier = require('../competence-100/verify.cjs');
const contract = require('../../backend/src/services/experienceCompetence/contract');
const agent = require('./agent.cjs');
const evidence = require('./evidence.cjs');
const protocol = require('./protocol.json');

function procedureView(state) {
  return Object.fromEntries(Object.entries(state.procedures).map(([op, record]) => [op,
    { rule: record.rule, modelSourceRef: record.modelSourceRef, source: record.source }]));
}

function checkProcedures(state) {
  for (const [op, record] of Object.entries(state.procedures)) {
    const samples = state.observations[op];
    assert.ok(samples.length >= 3);
    assert.equal(record.support, samples.length);
    assert.deepEqual(record.evidenceRefs, samples.map(row => row.runId));
    assert.equal(record.ruleHash, contract.digest({ op, rule: record.rule }));
    assert.equal(record.consolidation.consolidated, true);
    assert.equal(record.consolidation.provenance.episodeCount, samples.length);
    assert.ok(samples.every(row => record.rule.a * row.x + record.rule.b === row.y));
  }
}

function checkLearning(before, prepared, input) {
  const { event, row, task } = input;
  const after = event.state;
  const observed = event.observation;
  assert.deepEqual(contract.observationPayload(observed), { schema: contract.SCHEMA,
    agentId: row.arm, runId: row.forecast.runId, op: task.expression.op, x: task.expression.value,
    y: row.oracle.expected, forecast: row.forecast.probability, correct: row.oracle.numericCorrect && !row.response.abstain });
  assert.equal(observed.receipt.evidenceDigest, contract.digest(contract.observationPayload(observed)));
  const observations = structuredClone(before.observations);
  observations[observed.op] = [...(observations[observed.op] || []), observed];
  assert.deepEqual(after.observations, observations);
  assert.equal(after.version, before.version + 1);
  assert.deepEqual(after.proposals, prepared.proposals);
  assert.deepEqual(procedureView(after), procedureView(prepared));
  assert.equal(after.calibration.count, before.calibration.count + 1);
  const delta = Number(observed.correct) - observed.forecast;
  assert.ok(Math.abs(after.calibration.squaredError - before.calibration.squaredError - delta ** 2) < 1e-10);
  checkProcedures(after);
  assert.equal(event.stateHash, contract.digest(after));
  assert.equal(row.stateHashAfter, corpus.hash(after));
  return after;
}

function checkRow(row, context) {
  const task = context.tasks.get(row.taskId);
  const model = context.events.get(row.responseEvent);
  const forecast = context.events.get(row.forecastEvent);
  const execution = context.events.get(row.executedEvent);
  const measured = context.events.get(row.oracleEvent);
  assert.equal(model.type, row.phase === 'training' ? 'model_response' : 'procedure_request');
  assert.deepEqual(model.result.payload, agent.context(context.learned[row.arm], task, row.phase));
  assert.equal(model.result.modelPrompt, agent.modelPrompt(model.result.payload));
  const decoded = row.phase === 'training' ? agent.decode(model.result.raw, row.phase) : { valid: true, value: null };
  assert.deepEqual(model.result.value, decoded.value);
  assert.equal(row.valid, decoded.valid);
  assert.equal(row.modelBudgetVerified, evidence.budgetValid(model.result, context.manifest.model));
  assert.ok(model.index < forecast.index && forecast.index < execution.index && execution.index < measured.index);
  const before = context.learned[row.arm];
  const prepared = row.phase === 'training' ? agent.learning.consider(before, {
    op: task.expression.op, proposal: decoded.value?.proposal || null, sourceRef: row.responseEvent }) : before;
  const prediction = agent.prepare(prepared, task.expression, context.floor);
  assert.equal(row.forecast.probability, row.valid ? prediction.probability : 0);
  const expected = agent.execute(prepared, task.expression, prediction);
  if (row.valid) assert.deepEqual(row.response, expected);
  assert.deepEqual(row.response, execution.response);
  assert.deepEqual(row.oracle, oracle.assess({ task, response: row.response, world: context.manifest.corpus.world,
    known: Object.keys(context.manifest.corpus.world).slice(0, 4) }));
  assert.deepEqual(row.oracle, measured.oracle);
  if (row.phase === 'training') context.learned[row.arm] = checkLearning(before, prepared,
    { event: context.learning.get(row.forecast.runId), row, task });
}

function checkScores(report, rows) {
  const heldout = rows.filter(row => row.phase === 'heldout');
  const byArm = Object.fromEntries(protocol.arms.map(arm => [arm, statistics.metrics(heldout.filter(row => row.arm === arm))]));
  const transfer = statistics.comparisons(heldout);
  assert.deepEqual(report.byArm, byArm);
  assert.deepEqual(report.transfer, transfer);
  assert.deepEqual(report.conclusion, { ...statistics.conclusion({ byArm, transfer, integrity: report.integrity }), scope: protocol.scope });
}

function verify(directory, expectedHash) {
  assert.match(expectedHash || '', /^[a-f0-9]{64}$/);
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const manifest = read('manifest.json');
  const report = read('report.json');
  const rows = read('measurements.json');
  assert.equal(corpus.hash(manifest), expectedHash);
  assert.deepEqual(manifest.protocol, protocol);
  assert.deepEqual(manifest.corpus, corpus.generate(manifest.seeds));
  assert.deepEqual(manifest.provenance.sources, evidence.sourceHashes());
  const events = evidence.readJournal(directory);
  assert.equal(events[0].manifestHash, expectedHash);
  assert.equal(events.at(-1).reportHash, corpus.hash(report));
  assert.equal(events.at(-1).rowsHash, corpus.hash(rows));
  assert.equal(rows.length, 580);
  assert.equal(rows.filter(row => row.native).length, 100);
  assert.equal(report.calls, 100);
  legacyVerifier.checkSchedule(manifest, rows);
  const learning = new Map(events.filter(event => event.type === 'learning').map(event => [event.runId, event]));
  assert.equal(learning.size, 100);
  const context = { manifest, events: new Map(events.map(event => [event.hash, event])), learning,
    learned: Object.fromEntries(protocol.arms.map(arm => [arm, agent.learning.initial()])),
    tasks: new Map([...manifest.corpus.training, ...manifest.corpus.heldout].map(task => [task.id, task])), floor: 0.5 };
  for (const row of rows) {
    if (row.phase === 'heldout') context.floor = events.find(event => event.type === 'training_calibration').floor;
    checkRow(row, context);
  }
  checkScores(report, rows);
  assert.equal(report.calibration.final.trials, 260);
  return { verified: true, manifestHash: expectedHash, learningSteps: learning.size,
    procedures: Object.keys(context.learned.experienced.procedures).length, conclusion: report.conclusion,
    limitation: 'Mathematical replay and archive integrity; signed receipts were validated live, not revalidated with an exported secret.' };
}

if (require.main === module) {
  try { console.log(JSON.stringify(verify(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}
module.exports = { verify };

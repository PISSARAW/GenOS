import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {open, mission} from './session.mjs';
import {candidateRules, describe, accountedInferenceEvents} from './control.mjs';

const require = createRequire(import.meta.url);
const corpus = require('../competence-five-arms/corpus.cjs');
const evidence = require('../competence-five-arms/evidence.cjs');
const analysis = require('../competence-five-arms/analysis.cjs');
const methods = require('../competence-five-arms/methods.cjs');
const programs = require('./programs.cjs');
const training = require('./training.cjs');
const protocol = require('./protocol.json');
const integrity = require('./integrity.cjs');
const {clone} = require('./clone.cjs');
const prompt = require('./prompt.cjs');
const nativeMetrics = require('./native-metrics.cjs');

function write(directory, name, value) {
  fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2));
}

function armOrder(world) {
  const next = corpus.random(world.seed + ':arm-order');
  const result = [...protocol.arms];
  for (let index = result.length - 1; index > 0; index--) {
    const other = next(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function usageSummary(attempts) {
  const called = [...attempts.values()].filter(row => row.provider_called === 1);
  const known = called.filter(row => Number.isInteger(row.input_tokens) && Number.isInteger(row.output_tokens));
  return {actualProviderCalls: called.length, knownUsageCalls: known.length,
    inputTokens: known.reduce((sum, row) => sum + row.input_tokens, 0),
    outputTokens: known.reduce((sum, row) => sum + row.output_tokens, 0),
    unresolvedAttempts: [...attempts.values()].filter(row => row.status === 'started').map(row => row.id),
    allUsageMeasured: called.length > 0 && known.length === called.length
      && [...attempts.values()].every(row => row.status !== 'started')
      && called.every(row => row.status === 'completed' && row.token_usage_source === 'provider'),
    allCallsPinned: called.length > 0 && called.every(row => row.model === 'ollama://' + protocol.model),
    localComputeUsd: null};
}

function responses(input) {
  return input.queries.map(query => {
    const tool = methods.tool(input.history, query);
    if (input.arm === 'synthesis_only') return {...tool, valid: true};
    if (input.arm === 'hybrid' && (!tool.abstain || tool.missing.length)) return {...tool, valid: true};
    if (!input.runtimePassed) return {answer: null, confidence: 0, abstain: true,
      missing: [], reason: 'invalid', valid: false, source: 'native_runtime_rejected'};
    return programs.predict({query, rules: input.candidates.rules, observations: input.context.observations});
  });
}

function nativeDeclarations(query, declarations) {
  const ops = [...new Set(corpus.operators(query.expression))];
  return declarations.map(worker => ({workerId: worker.workerId,
    requested: ops.map(op => worker.rules.find(rule => rule.op === op && rule.epoch === (query.epochs[op] || 0)) || null)}));
}

async function induce(session, input, context) {
  if (input.arm === 'synthesis_only') return {execution: null,
    candidates: {rules: [], declarations: [], failures: []}, runtimePassed: true};
  const queries = corpus.queries(input.world, input.checkpoint);
    fs.writeFileSync(input.native.workspace + '/public-context.json', JSON.stringify(context, null, 2));
    const common = {...context, affinePrograms: input.arm === 'hybrid'
      ? queries.map(query => ({queryOperators: corpus.operators(query.expression), hint: methods.tool(session.history, query)})) : []};
    // Symbolic hints must never contain heldout query answers.
    common.affinePrograms = common.affinePrograms.map(row => ({queryOperators: row.queryOperators,
      hint: {abstain: row.hint.abstain, missing: row.hint.missing, reason: row.hint.reason}}));
    const execution = await mission(input.native, {id: 'cp' + input.checkpoint, context: common,
      prompt: prompt.build(common), useMemoryContext: ['genos_memory', 'hybrid'].includes(input.arm)});
    const candidates = candidateRules(execution.receipts, context.observations);
  const parsed = !execution.result.isError
    ? JSON.parse(execution.result.content.find(row => row.type === 'text').text) : null;
  return {execution, candidates, runtimePassed: execution.receipts.success && parsed?.success === true};
}

async function executeCheckpoint(session, input) {
  const context = await training.context(session, input);
  const queries = corpus.queries(input.world, input.checkpoint);
  const before = corpus.hash(session.history);
  const {execution, candidates, runtimePassed} = await induce(session, input, context);
  if (execution) session.inferenceAccounting.push(accountedInferenceEvents(execution.receipts));
  for (const row of execution?.receipts.attempts || []) session.attempts.set(row.id, row);
  const output = responses({arm: input.arm, queries, history: session.history, context, candidates, runtimePassed});
  const labels = evidence.oracle({world: input.world, queries, history: session.history});
  const rows = queries.map((query, index) => ({world: input.index, checkpoint: input.checkpoint,
    arm: input.arm, query, oracle: labels[index], response: output[index], runtimePassed,
    nativeDeclarations: nativeDeclarations(query, candidates.declarations),
    sourceMissionId: execution?.receipts.mission?.mission_id || null}));
  if (corpus.hash(session.history) !== before) throw Error('HELDOUT_FEEDBACK_LEAK');
  const retained = runtimePassed && execution ? await training.retain(session, {arm: input.arm,
    rules: candidates.rules, missionId: execution.receipts.mission.mission_id,
    receiptHash: integrity.fileHash(execution.directory + '/receipts.json')}) : [];
  session.rows.push(...rows);
  const record = {type: 'checkpoint', world: input.index, checkpoint: input.checkpoint, arm: input.arm,
    publicHistoryHash: before, context, candidates, runtimePassed, retained, rows,
    receipts: execution?.directory || null};
  session.append(record);
  write(session.directory, 'measurements.partial.json', session.rows);
  console.log(JSON.stringify({world: input.index, arm: input.arm, checkpoint: input.checkpoint,
    runtimePassed, admitted: candidates.rules.length, retained: retained.length}));
  return runtimePassed;
}

async function runArm(session, input) {
  let native = null;
  if (input.arm !== 'synthesis_only') {
    const runtimeRoot = session.directory + `/r${input.index}${protocol.arms.indexOf(input.arm)}`;
    const descriptor = clone(integrity.root, runtimeRoot);
    session.append({type: 'isolated_runtime', world: input.index, arm: input.arm, descriptor});
    native = await open(session.directory + `/a${input.index}${protocol.arms.indexOf(input.arm)}`, runtimeRoot);
  }
  try {
    session.history = [];
    for (const checkpoint of protocol.checkpoints) {
      await training.advance(session, {world: input.world, index: input.index, arm: input.arm, checkpoint});
      await executeCheckpoint(session, {...input, checkpoint, native});
    }
  } finally {if (native) await native.close();}
}

async function runWorld(session, input) {
  // Each arm has its own public training namespace and fresh native runtime/storage.
  for (const arm of input.order) {
    session.worldId = `world-${input.index}-${arm}`;
    session.operators = input.world.operators;
    await runArm(session, {...input, arm});
  }
}

async function main() {
  const control = integrity.verifyControl(process.argv[2], process.argv[3]);
  const model = await describe();
  const directory = 'D:/gv3/p' + crypto.randomBytes(4).toString('hex');
  fs.mkdirSync(directory);
  const worlds = Array.from({length: protocol.worlds}, () => corpus.world(crypto.randomBytes(24).toString('hex')));
  const manifest = {protocol, model, control, worlds, sealedAt: new Date().toISOString(),
    sourceManifest: integrity.verifySources(), primaryAssignment: 1800,
    statisticalUnit: 'world', armOrders: worlds.map(armOrder),
    learningUnit: 'one verified public observation; LLM induction at five checkpoints',
    deterministicArm: 'production affine synthesis without LLM or native multiworker mission',
    causalLimit: 'new model and execution protocol differ from v2; historical scores are descriptive only'};
  write(directory, 'manifest.json', manifest);
  const session = {directory, db: await training.connect(directory + '/training.sqlite'),
    rows: [], history: [], attempts: new Map(), inferenceAccounting: [], started: Date.now(), append: evidence.journal(directory)};
  const manifestHash = corpus.hash(manifest);
  session.append({type: 'manifest', manifestHash});
  console.log(JSON.stringify({directory, manifestHash}));
  try {
    for (const [index, world] of worlds.entries()) await runWorld(session, {index, world, order: manifest.armOrders[index]});
    const source = integrity.verifySources();
    const measured = analysis.report(session.rows);
    const result = {schema: protocol.schema, manifestHash, predictions: session.rows.length,
      elapsedMs: Date.now() - session.started, ...measured, modelUsage: usageSummary(session.attempts),
      nativeIgnorance: nativeMetrics.summarize(session.rows),
      integrity: {assignmentComplete: session.rows.length === manifest.primaryAssignment,
        allInferenceEventsAccounted: session.inferenceAccounting.every(Boolean),
        allNativeMissionsPassed: session.rows.every(row => row.runtimePassed), runtimeSourceHash: source.sourcesHash,
        runtimeHash: source.runtimeHash,
        modelUnchanged: (await describe()).digest === model.digest},
      conclusion: {primaryContrastsSupported: session.rows.every(row => row.runtimePassed)
        && session.inferenceAccounting.every(Boolean)
        && usageSummary(session.attempts).allUsageMeasured && measured.contrasts.every(row => row.supported),
        generalCompetenceDemonstrated: false, authorizesPromotion: false}};
    write(directory, 'measurements.json', session.rows); write(directory, 'report.json', result);
    session.append({type: 'report', reportHash: corpus.hash(result)});
    console.log(JSON.stringify({contrasts: result.contrasts, integrity: result.integrity}));
  } catch (error) {
    write(directory, 'incomplete.json', {error: error.message, predictions: session.rows.length,
      generalCompetenceDemonstrated: false, completedAt: new Date().toISOString()});
    throw error;
  } finally {await session.db.close();}
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error); process.exitCode = 1;});
}

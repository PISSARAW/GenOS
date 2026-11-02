'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const crypto = require('node:crypto');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= crypto.randomBytes(32).toString('hex');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const corpus = require('../competence-100/corpus.cjs');
const statistics = require('../competence-100/statistics.cjs');
const agent = require('./agent.cjs');
const meta = require('./metacognition.cjs');
const episode = require('./episode.cjs');
const evidence = require('./evidence.cjs');
const protocol = require('./protocol.json');

async function train(session) {
  for (const [index, task] of session.corpus.training.entries()) {
    await episode.run({ task, phase: 'training', arm: 'experienced' }, session);
    if ((index + 1) % 10 === 0) console.log(`Training ${index + 1}/100`);
  }
  const calibration = await meta.runBench(session.db, 'experienced', {});
  if (calibration.status !== 'measured') throw Error('Training calibration unavailable');
  session.floor = agent.abstention.floorFor(calibration, 0.5);
  session.append({ type: 'training_calibration', calibration, floor: session.floor });
  return calibration;
}

async function evaluate(session, filename) {
  const learned = await agent.store.load(session.db, agent.binding('experienced'));
  const trainedHash = corpus.hash(learned);
  await session.db.close();
  const restarted = spawnSync(process.execPath, [path.join(__dirname, 'restart.cjs'), filename, meta.verifierDigest()], {
    encoding: 'utf8', timeout: 15000, windowsHide: true, env: process.env });
  if (restarted.status !== 0) throw Error('Corrected state restart failed: ' + restarted.stderr);
  if (JSON.parse(restarted.stdout).hash !== trainedHash) throw Error('Restarted state mismatch');
  session.db = await agent.connect(filename);
  const next = corpus.random(session.seeds.order);
  for (const [index, task] of session.corpus.heldout.entries()) {
    for (const arm of corpus.shuffle(protocol.arms, next)) await episode.run({ task, phase: 'heldout', arm }, session);
    if ((index + 1) % 10 === 0) console.log(`Held-out ${index + 1}/160`);
  }
  return { restartRestored: true,
    heldoutDidNotLearn: corpus.hash(await agent.store.load(session.db, agent.binding('experienced'))) === trainedHash,
    resetStayedEmpty: (await agent.store.load(session.db, agent.binding('reset'))).version === 0 };
}

function summarize(session, integrity, calibration) {
  const rows = session.rows.filter(row => row.phase === 'heldout');
  const byArm = Object.fromEntries(protocol.arms.map(arm => [arm, statistics.metrics(rows.filter(row => row.arm === arm))]));
  const transfer = statistics.comparisons(rows);
  const result = statistics.conclusion({ byArm, transfer, integrity });
  return { schema: 'genos.competence-100.report/v2', manifestHash: session.manifestHash,
    trainingExperiences: session.history.length, calls: session.calls, elapsedMs: Date.now() - session.started,
    byArm, transfer, integrity, calibration, learningHistory: session.history,
    inputTokens: total(session.rows, 'inputTokens'), outputTokens: total(session.rows, 'outputTokens'),
    conclusion: { ...result, scope: protocol.scope }, limitations: protocol.limitations, monetaryCost: null };
}

const total = (rows, key) => rows.every(row => Number.isInteger(row[key])) ? rows.reduce((sum, row) => sum + row[key], 0) : null;

async function main() {
  const model = await evidence.describe(process.argv[2] || 'qwen2.5-coder:7b');
  await agent.oldInference.requireReady(model);
  const directory = path.join(process.env.GENOS_COMPETENCE_OUTPUT_ROOT || 'D:/genos-competence-results/v2', crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const seeds = Object.fromEntries(['world', 'test', 'order'].map(key => [key, crypto.randomBytes(24).toString('hex')]));
  const manifest = { protocol, model, seeds, corpus: corpus.generate(seeds), createdAt: new Date().toISOString(),
    provenance: { ...evidence.provenance(), sources: evidence.sourceHashes() }, preregistration: 'local-seal-before-experimental-inference' };
  evidence.write(directory, 'manifest.json', manifest);
  evidence.copySources(directory, manifest.provenance.sources);
  console.log(`Evidence: ${directory}\nManifest SHA-256: ${corpus.hash(manifest)}`);
  const filename = path.join(directory, 'agent.sqlite');
  const session = { directory, model, seeds, corpus: manifest.corpus, manifestHash: corpus.hash(manifest),
    rows: [], history: [], calls: 0, started: Date.now(), floor: 0.5,
    db: await agent.connect(filename), append: evidence.journal(directory) };
  session.append({ type: 'manifest', manifestHash: session.manifestHash });
  try {
    const trainingCalibration = await train(session);
    const retained = await evaluate(session, filename);
    const calibration = { training: trainingCalibration, final: await meta.runBench(session.db, 'experienced', {}) };
    const integrity = { ...retained, modelUnchanged: (await evidence.describe(model.name)).digest === model.digest,
      sourcesUnchanged: corpus.hash(manifest.provenance.sources) === corpus.hash(evidence.sourceHashes()),
      completeAssignment: session.rows.length === 580, exactly100Experiences: session.history.length === 100,
      budgetsVerified: session.rows.every(row => row.modelBudgetVerified), withinDuration: Date.now() - session.started <= 1200000,
      everyEpisodeApplied: session.history.every((row, i) => row.version === i + 1 && row.evidenceCount === i + 1),
      lateLearningActive: session.history[87].prediction !== session.history[99].prediction,
      independentCalibration: calibration.final.status === 'measured' && calibration.final.invalid === 0
        && calibration.final.unresolved === 0 && calibration.final.trials === 260 };
    const report = summarize(session, integrity, calibration);
    evidence.write(directory, 'measurements.json', session.rows);
    evidence.write(directory, 'report.json', report);
    session.append({ type: 'report', reportHash: corpus.hash(report), rowsHash: corpus.hash(session.rows) });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = Object.values(integrity).every(Boolean) ? 0 : 1;
  } finally { await session.db.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { summarize };

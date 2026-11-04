'use strict';
const c = require('./common.cjs');
const { CASES } = require('./cases.cjs');
const checker = require('./checker.cjs');

function sanity() {
  const references = {
    discount: 'module.exports = total => { if(typeof total !== "number" || !Number.isFinite(total) || total < 0) return null; return Math.round(total * (total >= 100 ? 0.9 : 1) * 100) / 100; };',
    pagination: 'module.exports = (items,page,size) => Array.isArray(items) && Number.isInteger(page) && page > 0 && Number.isInteger(size) && size > 0 ? items.slice((page-1)*size,page*size) : [];',
    port: 'module.exports = value => { if(typeof value === "string") { value = value.trim(); if(!/^\\d+$/.test(value)) return null; value = Number(value); } return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535 ? value : null; };'
  };
  return CASES.map(task => {
    const original = checker.evaluateCode(task.original, task);
    const reference = checker.evaluateCode(references[task.id], task);
    c.assert.equal(reference.allPassed, true, task.id + ': invalid oracle reference ' + JSON.stringify(reference));
    c.assert.ok(original.passed < original.total, task.id + ': fixture must contain an observed bug');
    return { caseId: task.id, original, reference };
  });
}

function genomes(archive) {
  const target = c.inside(archive, 'genomes');
  c.fs.mkdirSync(target);
  const baseline = c.path.join(target, 'baseline.dna');
  const variant = c.path.join(target, 'temperature-020.dna');
  const source = c.path.join(c.SOURCE, 'agents/dna/integration/local_code_worker.dna');
  c.fs.copyFileSync(source, baseline, c.fs.constants.COPYFILE_EXCL);
  c.cli(['speciate', '--input', baseline, '--output', variant,
    '--name', 'LocalCodeWorkerTemp020', '--graft', 'MODEL_TEMP=0.2']);
  const dna = c.service('agentDna');
  const before = dna.decodeFile(baseline), after = dna.decodeFile(variant);
  c.assert.equal(before.contentHash, 'f5a1c593b8976e051839f98808739702e1848dfb7fd8d62798dbccc201053be4');
  c.assert.equal(after.meta.status, 'DRAFT');
  const left = { ...before.phenotype, temp: 0.2 };
  c.assert.deepEqual(after.phenotype, left);
  for (const [locus, gene] of Object.entries(before.genes)) {
    if (locus !== 'MODEL_TEMP') c.assert.deepEqual(after.genes[locus], gene);
  }
  const emptyGrn = { edges: [], nodes: {} };
  c.assert.deepEqual(after.grn || emptyGrn, before.grn || emptyGrn, 'Regulatory graph differs');
  c.write(c.path.join(target, 'derivation-audit.json'), { baselineGrn: before.grn,
    variantGrn: after.grn, emptyGraphNormalization: true, semanticChange: 'MODEL_TEMP only' });
  for (const field of ['maternal', 'paternal', 'epigenome', 'development',
    'plasmids', 'enhancers', 'extraChromosomes', 'scars']) {
    c.assert.deepEqual(after[field], before[field], 'Unexpected genome change: ' + field);
  }
  c.assert.deepEqual(after.meta.parentIds, [before.meta.genomeId]);
  return Object.fromEntries([['baseline', before], ['temperature020', after]].map(([id, model]) => {
    const file = id === 'baseline' ? baseline : variant;
    const validation = c.cli(['validate', '--file', file]);
    c.assert.equal(validation.status, 'VALID');
    c.write(c.path.join(target, id + '-validation.json'), validation);
    return [id, { file, sha256: c.fileHash(file), contentHash: model.contentHash,
      name: model.meta.name, phenotype: model.phenotype, status: model.meta.status }];
  }));
}

function runs() {
  const output = [];
  let ordinal = 0;
  for (const task of CASES) {
    for (let repetition = 0; repetition < 3; repetition++) {
      const order = ordinal % 2 ? ['temperature020', 'baseline'] : ['baseline', 'temperature020'];
      const pairId = `${task.id}-r${repetition + 1}`;
      for (const arm of order) output.push({ ordinal: output.length + 1, pairId, caseId: task.id,
        repetition: repetition + 1, seed: 2026110401 + repetition, arm, runId: `${pairId}-${arm}` });
      ordinal++;
    }
  }
  return output;
}

async function main() {
  const archive = c.path.join(c.ROOT, 'archive', 'pilot-' + Date.now());
  c.fs.mkdirSync(archive);
  c.setup(archive);
  const identity = await c.modelIdentity();
  const version = await c.api('/api/version');
  c.write(c.path.join(archive, 'oracle-sanity.json'), sanity());
  const models = genomes(archive);
  const sourceFiles = ['workerGenomeExpression.js', 'localCodeWorkerService.js',
    'localCodeWorkerServiceStages1.js', 'localCodeWorkerServiceValues1.js', 'localCodeTestScope.js',
    'sandboxCommandPolicy.js', 'localCodeTestEnvironment.js'];
  const manifest = {
    schema: 'genos.local-code-temperature-pilot/v1', createdAt: new Date().toISOString(),
    sourceCommit: '9398e117d14355575b758088208ebb883845234e', archive,
    mode: 'real-genome-expression-real-ollama-genos-patch-executor',
    fullAutonomousMission: false, fullWorkerMissionReceipts: false,
    controllerRefusal: 'REQUIRED_PHASES_UNAVAILABLE', promotionAllowed: false,
    corpusScope: 'Three known small pure-JavaScript repair tasks; exploratory paired pilot only',
    model: identity, server: version.data, budget: c.CONFIG,
    campaignWallLimitMs: 1500000, attemptsPerRun: 1,
    qualityRule: 'All attempts remain in denominator; rejected/missing candidate scores zero of twelve; all-pass also requires admission, executor success and valid measured budget',
    costRule: 'Provider token counts measured; financial total and local compute cost unknown/null; no synthetic data',
    latencyRule: 'Warmup excluded and stored separately; measured generation and end-to-end include each run only',
    sandboxScope: 'Pure-function VM with no host/dynamic-code primitives, per-case timeout; controlled benchmark, not an OS security qualification',
    genomes: models, cases: CASES, runs: runs(), scripts: c.sources(),
    sourceFiles: Object.fromEntries(sourceFiles.map(file => [file,
      c.fileHash(c.path.join(c.SOURCE, 'backend/src/services', file))])),
    runtimeArchiveSha256: c.fileHash(c.path.join(c.ROOT, 'runtime/full-source.tar')),
    nativeBinarySha256: c.fileHash(c.path.join(c.ROOT, 'runtime/genos.exe')),
    canonicalSourceGenomeSha256: c.fileHash(c.path.join(c.LIVE, 'agents/dna/integration/local_code_worker.dna'))
  };
  manifest.manifestHash = c.hash(JSON.stringify(manifest));
  c.write(c.path.join(archive, 'manifest.json'), manifest);
  c.fs.writeFileSync(c.path.join(c.ROOT, 'archive', 'active-pilot.json'),
    JSON.stringify({ archive, manifestHash: manifest.manifestHash }, null, 2) + '\n');
  console.log(JSON.stringify({ archive, runs: manifest.runs.length, manifestHash: manifest.manifestHash,
    variantHash: models.temperature020.contentHash }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

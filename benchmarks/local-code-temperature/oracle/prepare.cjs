'use strict';
const c = require('./common.cjs');
async function main() {
  const original = c.read('D:/GenOS-Experiments/local-code-temp-20261104/archive/pilot-1793787027905/manifest.json');
  const archive = c.path.join(c.ROOT, 'archive', 'oracle-' + Date.now());
  c.fs.mkdirSync(archive);
  const genomes = {};
  for (const [arm, info] of Object.entries(original.genomes)) {
    const file = c.inside(archive, 'genomes/' + arm + '.dna');
    c.fs.mkdirSync(c.path.dirname(file), { recursive: true });
    c.fs.copyFileSync(info.file, file, c.fs.constants.COPYFILE_EXCL);
    c.assert.equal(c.fileHash(file), info.sha256);
    genomes[arm] = { ...info, file };
  }
  const provenance = c.read(c.path.join(c.ROOT, 'runtime/provenance.json'));
  provenance.criticalFiles = Object.fromEntries(Object.entries(provenance.files).filter(([file]) =>
    /\/(javascriptRepair(Contract|Cases|Checks)|workspaceVerificationContract|oracleWorkspaceChecks|missionTruthSources|reportCompilerService|workerEvidenceTruthGate|verifierImplementationManifest)\.js$/.test(file)));
  const historical = Object.fromEntries(['common', 'execution', 'checker', 'cases', 'report'].map(name => {
    const file = 'D:/GenOS-Experiments/local-code-temp-20261104/scripts/' + name + '.cjs';
    return [file, c.fileHash(file)];
  }));
  const manifest = { schema: 'genos.oracle-temperature-benchmark/v1', createdAt: new Date().toISOString(), archive,
    provenance, originalManifestHash: original.manifestHash, cases: original.cases, runs: original.runs, genomes,
    budget: original.budget, attemptsPerRun: 1, campaignWallLimitMs: 1500000, promotionAllowed: false,
    fullWorkerRuntime: true, fullAutonomousController: false,
    controller: 'Local bounded controller; each trial executes the native worker, oracle and parent truth report gates.',
    setupExcluded: true, financialCostUsd: null, scripts: c.sources(), historical,
    protocol: 'Same tasks, genomes, seeds, counterbalanced order and budgets as the first manifest. Source-bound native JavaScript suite, two measured verifier processes, sealed worker assignment persisted before execution. No gate disabled, no failure retry, no promotion.',
    scoring: 'All planned trials retained. Candidate 12-case score, native proof acceptance and parent truth gate reported separately. Missing or timed out trials never qualify. Warmup and preflight explicitly excluded. Campaign reserves 120 seconds before starting each trial.',
    identity: await c.modelIdentity() };
  manifest.manifestHash = c.hash(JSON.stringify(manifest));
  c.write(c.path.join(archive, 'manifest.json'), manifest);
  c.write(c.path.join(c.ROOT, 'archive/active-oracle.json'), { archive });
  console.log(JSON.stringify({ archive, manifestHash: manifest.manifestHash, runs: manifest.runs.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

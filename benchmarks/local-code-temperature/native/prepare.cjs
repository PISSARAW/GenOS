'use strict';
const c = require('./common.cjs');
async function main() {
  const original = c.read('D:/GenOS-Experiments/local-code-temp-20261104/archive/pilot-1793787027905/manifest.json');
  const archive = c.path.join(c.ROOT, 'archive', 'native-' + Date.now());
  c.fs.mkdirSync(archive);
  const genomes = {};
  for (const [arm, info] of Object.entries(original.genomes)) {
    const file = c.inside(archive, 'genomes/' + arm + '.dna');
    c.fs.mkdirSync(c.path.dirname(file), { recursive: true });
    c.fs.copyFileSync(info.file, file, c.fs.constants.COPYFILE_EXCL);
    c.assert.equal(c.fileHash(file), info.sha256);
    genomes[arm] = { ...info, file };
  }
  const manifest = { schema: 'genos.native-temperature-benchmark/v1', createdAt: new Date().toISOString(), archive,
    sourceCommit: '01333f81c', sourceArchiveSha256: c.fileHash(c.path.join(c.ROOT, 'runtime/source-limits.tar')),
    sourceOverlay: { commit: 'eb7b89601', sha256: c.fileHash(c.path.join(c.ROOT, 'runtime/inference-transport.tar')),
      paths: ['backend/src/services/workerInferenceLimits.js', 'backend/src/services/agentRuntimeAdapter/missionPlanningValues1.js'] },
    nativeBinarySha256: c.fileHash(c.path.join(c.ROOT, 'runtime/genos.exe')),
    originalManifestHash: original.manifestHash, cases: original.cases, runs: original.runs, genomes,
    budget: original.budget, attemptsPerRun: 1, campaignWallLimitMs: 1500000, promotionAllowed: false,
    fullWorkerRuntime: true, fullAutonomousController: false,
    controllerRefusals: ['MISSION_TRUTH_GRAPH_UNAVAILABLE', 'MCP_TIMEOUT'],
    setupExcluded: true, financialCostUsd: null, scripts: c.sources(),
    historicalOracleScripts: original.scripts,
    protocol: 'Full native worker path in isolated per-run D database. Explicit registered tenant, parent budget, native DNA selection and signed authority, real modelRouter request, host test receipt and native evidence outcome. Private experimental runtime catalog entry active for selection; both DNA containers remain DRAFT. No genome promotion or production catalog change.',
    scoring: 'All attempts retained. Candidate quality uses unchanged independent 12-case oracle. Native completion/acceptance is reported separately; missing native proof is never treated as qualification. One provider generation, <=8192 total tokens, <=1536 output, 120000ms total per process. All unknown monetary costs null.',
    identity: await c.modelIdentity() };
  manifest.manifestHash = c.hash(JSON.stringify(manifest));
  c.write(c.path.join(archive, 'manifest.json'), manifest);
  c.fs.writeFileSync(c.path.join(c.ROOT, 'archive/active-native.json'), JSON.stringify({ archive }));
  console.log(JSON.stringify({ archive, manifestHash: manifest.manifestHash, runs: manifest.runs.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

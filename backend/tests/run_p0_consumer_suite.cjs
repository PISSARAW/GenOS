'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const cases = require('./p0ConsumerCases.cjs');

function hashFile(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function sourceHashes(directory) {
  const hashes = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.genos-agent-worlds', '.genos-runtime'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, sourceHashes(filename));
    else if (/\.(js|cjs|json)$/.test(entry.name)) hashes[filename] = hashFile(filename);
  }
  return hashes;
}

function sourceManifest() {
  const directories = ['../src', '../proto', '../../shared', '../../mcp'];
  return Object.assign({}, ...directories.map(directory => sourceHashes(path.resolve(__dirname, directory))));
}

function execute(spec, output) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-consumer-case-'));
  try {
    const filename = path.join(__dirname, spec.file);
    if (!fs.existsSync(filename)) throw new Error(`Missing qualification test: ${spec.file}`);
    const started = Date.now();
    const result = spawnSync(process.execPath, [filename], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 180000,
      maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', GENOS_DB_PATH: path.join(scratch, 'genos.db'),
        GENOS_DB_BACKUP_SKIP: '1', GENOS_STUDIO_ROOT: path.join(scratch, 'studio'),
        GENOS_ADMIN_PASSWORD: 'consumer-suite-test-only' }
    });
    const log = `${spec.lot}-${path.basename(spec.file)}.log`;
    fs.writeFileSync(path.join(output, log), `${result.stdout || ''}\n${result.stderr || ''}`);
    return { ...spec, code: result.status, signal: result.signal, error: result.error?.message || null,
      durationMs: Date.now() - started, log, sourceHash: hashFile(filename) };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  const output = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'genos-consumers-evidence-')));
  fs.mkdirSync(output, { recursive: true });
  const before = sourceManifest();
  const results = [];
  for (const [lot, files] of Object.entries(cases)) {
    for (const file of files) {
      const result = execute({ lot, file }, output);
      results.push(result);
      console.log(`${lot} ${result.code === 0 ? 'PASS' : 'FAIL'} ${file} (${result.durationMs} ms)`);
      fs.writeFileSync(path.join(output, 'consumer-results.json'), JSON.stringify({ results }, null, 2));
    }
  }
  const after = sourceManifest();
  const changedSources = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(filename => before[filename] !== after[filename]);
  const passed = results.filter(result => result.code === 0).length;
  fs.writeFileSync(path.join(output, 'consumer-results.json'), JSON.stringify({ passed, total: results.length,
    results, changedSources, sourceHashes: after, scientificGainEstablished: false }, null, 2));
  console.log(`Consumer qualification: ${passed}/${results.length} commands passed; ${changedSources.length} source changes during run. Evidence: ${output}`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main();

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function main() {
  const [caseId] = process.argv.slice(2);
  if (!/^(?:rs)-(?:empty-average|percentile-boundary|median|filter-above|api-reference|boundary-examples|shared-validation|summary-helper)$/.test(caseId || '')) {
    throw new Error('unknown oracle');
  }
  const candidate = fs.realpathSync(process.cwd());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-g1-rust-oracle-'));
  try {
    const tests = path.join(root, 'tests');
    fs.mkdirSync(tests, { recursive: true });
    const template = path.join(__dirname, 'tests', 'acceptance.rs');
    const dependencyPath = JSON.stringify(candidate.replace(/\\/g, '/'));
    const cargoToml = [
      '[package]', `name = "g1_oracle_${caseId.replace(/-/g, '_')}"`,
      'version = "0.1.0"', 'edition = "2021"', '',
      '[dependencies]', `g1_metrics = { path = ${dependencyPath} }`, ''
    ].join('\n');
    fs.writeFileSync(path.join(root, 'Cargo.toml'), cargoToml, { flag: 'wx' });
    fs.writeFileSync(path.join(root, 'case.id'), caseId.slice(3), { flag: 'wx' });
    fs.writeFileSync(path.join(root, 'candidate.path'), candidate, { flag: 'wx' });
    fs.copyFileSync(template, path.join(tests, 'acceptance.rs'));
    const env = { ...process.env, CARGO_NET_OFFLINE: 'true', CARGO_TARGET_DIR: path.join(root, 'target') };
    const result = spawnSync('cargo', ['test', '--offline', '--quiet', '--manifest-path', path.join(root, 'Cargo.toml')], {
      cwd: candidate, env, encoding: 'utf8', windowsHide: true, timeout: 240000,
      maxBuffer: 1024 * 1024
    });
    if (result.error || result.status !== 0) throw new Error('G1 oracle failed');
    process.stdout.write('G1 oracle passed\n');
  } finally {
    const resolved = path.resolve(root);
    const temporaryRoot = path.resolve(os.tmpdir());
    const relative = path.relative(temporaryRoot, resolved);
    if (!relative.startsWith('genos-g1-rust-oracle-') || path.isAbsolute(relative)) {
      throw new Error('Refusing to remove a path outside the dedicated oracle root.');
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

try { main(); } catch (_) { process.stderr.write('G1 oracle failed\n'); process.exitCode = 1; }

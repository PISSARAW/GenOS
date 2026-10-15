'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const targetDirectory = path.resolve(root, process.env.CARGO_TARGET_DIR || 'target');

execFileSync('cargo', ['build', '--manifest-path', path.join(root, 'Cargo.toml'),
  '--package', 'genos-orchestrator', '--example', 'receipt_bridge', '--features', 'api', '--jobs', '1'],
{ cwd: root, stdio: 'inherit' });
execFileSync('cargo', ['build', '--manifest-path', path.join(root, 'Cargo.toml'),
  '--package', 'genos-cli', '--jobs', '1'], { cwd: root, stdio: 'inherit' });
process.env.CARGO_TARGET_DIR = targetDirectory;
require('./test_clinical_revocation_rust_cli_e2e.cjs');

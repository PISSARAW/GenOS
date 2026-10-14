'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const executable = process.platform === 'win32' ? 'receipt_bridge.exe' : 'receipt_bridge';
const targetDirectory = path.resolve(repositoryRoot, process.env.CARGO_TARGET_DIR || 'target');
const binary = path.join(targetDirectory, 'debug', 'examples', executable);

execFileSync('cargo', [
  'build',
  '--manifest-path', path.join(repositoryRoot, 'Cargo.toml'),
  '--package', 'genos-orchestrator',
  '--example', 'receipt_bridge',
  '--features', 'api',
  '--jobs', '1'
], { cwd: repositoryRoot, stdio: 'inherit' });

process.env.GENOS_RECEIPT_TEST_BINARY = binary;
require('./test_rust_receipt_process_e2e');

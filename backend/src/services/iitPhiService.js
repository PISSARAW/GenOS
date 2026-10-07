'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function validate(input) {
  if (!Array.isArray(input.state) || input.state.length < 1 || input.state.length > 4) {
    throw new TypeError('Phi is bounded to 1-4 declared binary nodes.');
  }
  if (input.tpmKind !== 'interventional' || input.conditionalIndependence !== true) {
    throw new TypeError('Interventional TPM and explicit independence assumption required.');
  }
  if (!/^[a-f0-9]{64}$/.test(input.protocolHash || '')) throw new TypeError('Pinned intervention protocol required.');
}

function runPython(input, options) {
  return new Promise((resolve) => {
    const script = path.resolve(__dirname, '../../../scripts/evaluation/compute_iit_phi.py');
    const child = spawn(options.pythonPath || 'python', [script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); }, Math.min(60000, options.timeoutMs || 30000));
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); resolve({ status: 'not_run', reason: 'python_unavailable', phi: null }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ status: 'not_run', reason: 'phi_process_failed', phi: null, detail: stderr });
      try { resolve(JSON.parse(stdout)); }
      catch (_) { resolve({ status: 'not_run', reason: 'invalid_phi_output', phi: null }); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function compute(input, options = {}) {
  validate(input);
  const result = await runPython(structuredClone(input), options);
  const modelHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return { ...result, modelHash, protocolHash: input.protocolHash, promotionAllowed: false,
    limitation: 'Phi belongs only to the declared interventional binary model, not to the entire runtime.' };
}

module.exports = { compute, validate };

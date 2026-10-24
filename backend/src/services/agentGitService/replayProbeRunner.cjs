'use strict';

const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');

function configuredProbe(name) {
  let registry;
  try { registry = JSON.parse(process.env.GENOS_AGENT_GIT_REPLAY_PROBES || '{}'); }
  catch (_) { throw new Error('Invalid server replay probe registry.'); }
  const filename = registry[name];
  if (!name || typeof filename !== 'string' || !path.isAbsolute(filename)) {
    throw new Error('A server-registered replay probe is required.');
  }
  return filename;
}

function runProbe(input) {
  const filename = configuredProbe(input.name);
  const payload = JSON.stringify({ state: input.state, fixtures: input.fixtures || {}, seed: input.seed,
    now: input.now });
  if (Buffer.byteLength(payload) > 2_000_000) throw new Error('Replay probe input exceeds 2 MB.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'replayProbeWorker.cjs'), filename], {
      cwd: path.dirname(filename), env: { NODE_ENV: 'test', GENOS_AGENT_GIT_REPLAY: '1' },
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    let output = '';
    let error = '';
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 1_000_000) child.kill(); });
    child.stderr.on('data', (chunk) => { error += chunk; if (error.length > 4000) child.kill(); });
    child.on('error', (cause) => { clearTimeout(timer); reject(cause); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Replay probe failed: ${error.slice(0, 400) || code}`));
      try {
        const result = JSON.parse(output);
        if (typeof result.pass !== 'boolean') throw new Error('Probe must return a boolean pass result.');
        const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({ payload, result })).digest('hex');
        resolve({ pass: result.pass, evidence: result.evidence || null, evidenceHash });
      } catch (cause) { reject(cause); }
    });
    child.stdin.end(payload);
  });
}

module.exports = { runProbe, configuredProbe };

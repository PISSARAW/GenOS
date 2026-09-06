const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const runner = path.join(repositoryRoot, 'examples/safe-debugging-demo/run-demo.mjs');
const artifact = path.join(repositoryRoot, 'examples/safe-debugging-demo/artifacts/latest.json');
let activeRun = null;

function validEvidence(value) {
  return Boolean(value?.source?.command && value?.source?.fixture && Array.isArray(value.candidates) && value.selection && value.usage && value.runtime);
}

async function readLatest() {
  let evidence;
  try {
    evidence = JSON.parse(await fs.readFile(artifact, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { available: false, running: Boolean(activeRun), evidence: null };
    throw error;
  }
  if (!validEvidence(evidence)) throw new Error('Safe-debugging proof artifact has an invalid schema.');
  return { available: true, running: Boolean(activeRun), evidence };
}

function executeProof() {
  if (activeRun) return activeRun;
  activeRun = new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner], { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
    child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-12000); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Safe-debugging proof failed${signal ? ` (${signal})` : ''}: ${(stderr || output).trim() || `exit ${code}`}`));
        return;
      }
      activeRun = null;
      try { resolve(await readLatest()); } catch (error) { reject(error); }
    });
  }).finally(() => { activeRun = null; });
  return activeRun;
}

const crypto = require('crypto');

async function generateProof(featureId = 'safe-debugging', executionId = null) {
  const latest = await readLatest();
  if (!latest.available) throw new Error('A completed proof artifact is required.');
  const evidence = latest.evidence;
  const winner = evidence.candidates.find((candidate) => candidate.name === evidence.selection?.winner);
  if (evidence.baseline?.reproduced !== true || !winner || winner.success !== true || winner.exit_code !== 0 || Number(winner.tests_passed) <= 0 || evidence.selection?.replay_verified !== true) {
    throw new Error('Proof artifact does not contain independently verified baseline, winner, tests and replay evidence.');
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  return {
    hash,
    evidence,
    claims: [
      { id: 'claim-parallel-isolation', verified: evidence.baseline.reproduced === true, rule: 'directory_isolation' },
      { id: 'claim-boundary-test', verified: winner.tests_passed > 0 && winner.exit_code === 0, rule: 'unit_test_gate' },
      { id: 'claim-replay-diff-zero', verified: evidence.selection.replay_verified === true, rule: 'deterministic_replay' }
    ]
  };
}

function verifyProof(proofHash, evidence) {
  if (typeof proofHash !== 'string' || !/^[a-f0-9]{64}$/i.test(proofHash) || !evidence) return false;
  const expected = crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  return proofHash.toLowerCase() === expected;
}

module.exports = { readLatest, executeProof, validEvidence, generateProof, verifyProof };

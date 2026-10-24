'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dockerRunArgs, containerArguments, imageDigest, containerProgram } = require('../src/services/ontogenesis/dockerVerifierRunner');
const proofService = require('../src/services/ontogenesis/proofService');
const { defaultConfig, validateProjectConfig } = require('../src/services/ontogenesis/configSchema');
const { configuredVerifierImage } = require('./prepare_ontogenesis_g1.cjs');
const fixture = require('./ontogenesisFixture');

const IMAGE = `registry.example.invalid/genos/ontogenesis-verifier@sha256:${'a'.repeat(64)}`;

async function proofBinding() {
  const workspace = await fixture.repository();
  const oracleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-oracle-proof-'));
  const script = path.join(oracleRoot, 'verify.cjs');
  fs.writeFileSync(script, '');
  const checks = [{ program: process.execPath, args: [script, 'rs-median'],
    sandbox: { runtime: 'docker', image: IMAGE, oracleRoot } }];
  try {
    const proof = await proofService.verifyChecks(workspace, checks, { runDocker: async (input) => {
      assert.equal(input.cwd, workspace);
      assert.equal(input.sandbox.oracleRoot, oracleRoot);
      return { sandboxEvidence: { runtime: 'docker-linux', imageDigest: IMAGE, network: 'none',
        rootFilesystem: 'read-only', workspaceMount: 'read-only', oracleMount: 'read-only',
        capabilitySet: 'drop-all', memoryLimitMb: 768, cpuLimit: 1, pidLimit: 64 } };
    } });
    assert.deepEqual(proofService.validateProofs(proof, checks), []);
    const forged = { ...proof, proofs: proof.proofs.map((item) => ({ ...item,
      sandboxEvidence: { ...item.sandboxEvidence, network: 'bridge' } })) };
    assert.deepEqual(proofService.validateProofs(forged, checks), ['preuve-invalide']);
    assert.deepEqual(proofService.validateProofs(proof, [{ ...checks[0], sandbox: { ...checks[0].sandbox,
      image: `${IMAGE.slice(0, -64)}${'b'.repeat(64)}` } }]), ['preuve-invalide']);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(oracleRoot, { recursive: true, force: true });
  }
}

function runnerContract() {
  const workspace = path.resolve('workspace');
  const oracleRoot = path.resolve('campaign/oracles/case');
  const args = dockerRunArgs({ program: 'node.exe', args: [path.join(oracleRoot, 'verify.cjs'), 'rs-median'],
    sandbox: { image: IMAGE } }, 'genos-onto-verifier-test', { workspace, oracleRoot });
  for (const flag of ['--pull=never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--pids-limit', '64', '--memory', '768m', '--memory-swap', '768m', '--user', '65532:65532']) {
    assert.ok(args.includes(flag), `missing docker restriction: ${flag}`);
  }
  assert.ok(args.some((value) => value === `type=bind,src=${workspace},dst=/workspace,readonly`));
  assert.ok(args.some((value) => value === `type=bind,src=${oracleRoot},dst=/oracle,readonly`));
  assert.equal(args.at(-1), 'rs-median');
  assert.equal(containerProgram('C:\\Program Files\\nodejs\\node.exe'), '/usr/local/bin/node');
  assert.throws(() => imageDigest('latest'), /epinglee-par-digest/);
  assert.throws(() => containerArguments(['node', 'rs-median'], oracleRoot), /hors-racine-oracle/);
  assert.throws(() => containerArguments([path.join(oracleRoot, 'verify.cjs'), '--privileged'], oracleRoot), /argument-verificateur/);
}

function campaignProfileContract() {
  const previous = process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE;
  delete process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE;
  assert.throws(() => configuredVerifierImage(), /image locale épinglée par digest/);
  const config = defaultConfig();
  config.checks = [{ program: 'node', args: ['verify.cjs'], sandbox: {
    runtime: 'docker', image: IMAGE, oracleRoot: path.resolve('campaign/oracles/case')
  } }];
  assert.equal(validateProjectConfig(config).ok, true);
  config.checks[0].sandbox.image = 'latest';
  assert.ok(validateProjectConfig(config).errors.includes('verification-sandbox-docker-invalide'));
  if (previous !== undefined) process.env.GENOS_ONTOGENESIS_G1_VERIFIER_IMAGE = previous;
}

async function main() {
  runnerContract();
  campaignProfileContract();
  await proofBinding();
  console.log('Ontogenesis Docker verifier confinement and receipt binding checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

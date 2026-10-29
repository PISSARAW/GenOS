'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startOrchestratorMission } = require('../bin/orchestratorMissionHelpers.cjs');
const { writeArtifacts } = require('../src/services/localArtifactWriter');
const { validateCandidate } = require('../src/services/ontogenesis/integrationService');
const { workerWriteScope } = require('../src/services/ontogenesis/workerWriteScope');

async function missionPolicyCarriesNormalizedScope() {
  let started;
  await startOrchestratorMission({
    db: null, strategyContract: { contract: {} }, missionBudget: {}, useLocalRuntime: false,
    requestTimeoutMs: 1000, id: 'scope-test', missionId: null, enhancedPrompt: 'scope test',
    policyRequest: { allowed_write_paths: ['src/', 'src\\'] },
    request: { allowed_write_paths: ['src/', 'src\\'] }, allowedCommands: [],
    allowFileEdits: true, runtime: { startMission: async (mission) => { started = mission; } },
    morphology: null
  });
  assert.deepEqual(started.executionPolicy.allowedWritePaths, ['src']);
  assert.throws(() => workerWriteScope({}, true), /authority-write-paths-required/);
  assert.deepEqual(workerWriteScope({}, false), {});
}

function workerWriterRejectsOutOfScopeBeforeMutation() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-write-scope-'));
  try {
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.mkdirSync(path.join(workspaceRoot, 'docs'));
    const reply = JSON.stringify({ artifactText: [
      '[ARTIFACT: src/change.js]allowed[/ARTIFACT]',
      '[ARTIFACT: docs/change.md]forbidden[/ARTIFACT]'
    ].join('\n') });
    const result = writeArtifacts(reply, { workspaceRoot, allowFileEdits: true,
      allowedWritePaths: ['src'] });
    assert.deepEqual(result.written.map((entry) => entry.path.replace(/\\/g, '/')), ['src/change.js']);
    assert.deepEqual(result.rejected, [{ name: 'docs/change.md',
      issues: ['artifact.path.not_authorized:docs/change.md'] }]);
    assert.equal(fs.readFileSync(path.join(workspaceRoot, 'src/change.js'), 'utf8'), 'allowed');
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'docs/change.md')), false);
    assert.throws(() => writeArtifacts(reply, { workspaceRoot, allowFileEdits: true }),
      /artifact.path.scope_required/);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

function integrationKeepsIndependentPathGate() {
  const treeHash = 'a'.repeat(64);
  const checks = [{ program: 'npm', args: ['test'], trustMode: 'operator_trusted_host' }];
  const result = validateCandidate({
    candidate: { branch: 'main', baseSha: 'base', treeHash, files: ['docs/change.md'],
      proofs: [{ source: 'ontogenesis-verifier', exitCode: 0, command: 'node verify.cjs',
        completedAt: '2026-10-29T00:00:00.000Z', treeHash,
        verificationEvidence: { runtime: 'host', trustMode: 'operator_trusted_host' } }] },
    checks,
    authority: { branches: ['main'], paths: ['src/'] }
  });
  assert.ok(result.errors.includes('chemin-hors-perimetre:docs/change.md'));
}

async function main() {
  await missionPolicyCarriesNormalizedScope();
  workerWriterRejectsOutOfScopeBeforeMutation();
  integrationKeepsIndependentPathGate();
  console.log('Ontogenesis worker write scope checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');
const receipts = require('../src/services/ontogenesis/missionVerifierReceiptService');

function loadCompletionGate() {
  const contextPath = require.resolve('../bin/orchestratorMissionHelpersBuildContext.cjs');
  const continuityPath = require.resolve('../src/services/missionContinuityService');
  const completionPath = require.resolve('../src/services/ontogenesis/missionCompletion');
  require.cache[contextPath] = { id: contextPath, filename: contextPath, loaded: true,
    exports: { buildMissionContext: async () => ({ context: { flags: { verifierReceiptPresent: true }, evidence: [] } }) } };
  require.cache[continuityPath] = { id: continuityPath, filename: continuityPath, loaded: true,
    exports: { buildMissionInput: () => ({}), evaluateContinuity: async () => ({ organism: {} }),
      transitionMissionToComplete: async () => ({ allowed: true }) } };
  return require(completionPath).completionGate;
}

async function repository() {
  const root = fs.mkdtempSync(path.join(__dirname, '.tmp-verifier-receipt-'));
  await runCommand('git', ['init', '-b', 'main'], { cwd: root });
  await runCommand('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  await runCommand('git', ['config', 'user.name', 'Ontogenesis verifier test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = "complete";\n');
  await runCommand('git', ['add', 'app.js'], { cwd: root });
  await runCommand('git', ['commit', '-m', '[TEST] Initial'], { cwd: root });
  return root;
}

async function main() {
  const root = await repository();
  const checks = [{ program: process.execPath, args: ['-e', 'if (require("./app") !== "complete") process.exit(1)'],
    trustMode: 'operator_trusted_host' }];
  try {
    const receipt = await receipts.createReceipt({ missionId: 'onto-1', workspaceRoot: root,
      checks, allowExecution: true, transitionId: 'morph_epoch-a', timeoutMs: 10000 });
    assert.equal(await receipts.validateReceipt(receipt, { missionId: 'onto-1', workspaceRoot: root, checks }), true);
    assert.equal(await receipts.validateReceipt(receipt, { missionId: 'onto-1', workspaceRoot: root, checks,
      transitionId: 'morph_epoch-a' }), true);
    assert.equal(await receipts.validateReceipt(receipt, { missionId: 'onto-1', workspaceRoot: root, checks,
      transitionId: 'morph_epoch-b' }), false,
    'an otherwise valid oracle receipt cannot be reused for another morphogenesis transition');
    const completionGate = loadCompletionGate();
    const input = { request: { id: 'onto-1', mission: 'test', requiresEvidenceBeforePromotion: true,
      workspaceRoot: root, verifierChecks: checks }, agents: [{ id: 'worker-1', status: 'completed' }], verifierReceipt: receipt };
    assert.deepEqual(await completionGate({}, input), { allowed: true });
    assert.deepEqual(await completionGate({}, { ...input, verifierReceipt: { ...receipt, missionId: 'forged' } }),
      { allowed: false, reason: 'verifier-receipt-independant-requis' });
    assert.equal(await receipts.validateReceipt({ ...receipt, schema: 'unknown' }, {
      missionId: 'onto-1', workspaceRoot: root, checks,
    }), false);
    assert.equal(await receipts.validateReceipt(receipt, { missionId: 'onto-2', workspaceRoot: root, checks }), false);
    assert.equal(await receipts.validateReceipt(receipt, { missionId: 'onto-1', workspaceRoot: root,
      checks: [{ ...checks[0], args: ['-e', 'process.exit(0)'] }] }), false);
    fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = "changed";\n');
    assert.equal(await receipts.validateReceipt(receipt, { missionId: 'onto-1', workspaceRoot: root, checks }), false);
    assert.equal(await receipts.createReceipt({ missionId: 'onto-1', workspaceRoot: root,
      checks, allowExecution: false, timeoutMs: 10000 }), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  process.stdout.write('Ontogenesis verifier receipt binding checks passed.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

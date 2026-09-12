/**
 * Test Suite — SWE Sandbox Verification Service & MCP Handler
 * Vérifie le contrôle de syntaxe sandboxé, le signal d'erreur cérébelleux
 * et la barrière de preuve apoptotique du Checkpoint p53.
 */

const assert = require('assert');
const { SweSandboxVerificationService, defaultSweSandboxVerification } = require('../src/services/sweSandboxVerificationService');
const { handleSweSandboxVerification } = require('../src/services/mcpBioTools/handlers/sweSandboxVerification');

async function runTests() {
  console.log('====================================================');
  console.log('    GenOS V3 - Test SWE Sandbox & p53 Gate          ');
  console.log('====================================================');

  const verifier = new SweSandboxVerificationService();

  // 1. Test Python Syntax Verification
  console.log('[1/4] Testing static Python syntax verification...');
  const validCode = 'def add_q_object(q, *args):\n    return q.clone() if q else None\n';
  const validReport = verifier.verifyPythonSyntax(validCode, 'valid_test.py');
  assert.strictEqual(validReport.syntaxValid, true);
  assert.strictEqual(validReport.p53Status, 'PASSED');
  console.log('  -> Valid code approved by p53 gate');

  const invalidCode = 'def broken_syntax(:\n    return None\n';
  const invalidReport = verifier.verifyPythonSyntax(invalidCode, 'invalid_test.py');
  assert.strictEqual(invalidReport.syntaxValid, false);
  assert.strictEqual(invalidReport.p53Status, 'BLOCKED_APOPTOSIS');
  assert.ok(invalidReport.faultLine !== null || invalidReport.error);
  console.log('  -> Syntax mutation blocked by p53 apoptotic checkpoint');

  // 2. Test Cerebellar Motor Error Signal
  console.log('[2/4] Testing cerebellar motor adjustment feedback...');
  const motorError = verifier.computeCerebellarMotorError(invalidReport);
  assert.strictEqual(motorError.hasDivergence, true);
  assert.strictEqual(motorError.errorType, 'SYNTAX_DIVERGENCE');
  assert.ok(motorError.motorAdjustmentPrompt.includes('Syntax error'));
  console.log('  -> Cerebellar motor feedback generated:', motorError.motorAdjustmentPrompt);

  // 3. Test Patch Evaluation with p53 Gate
  console.log('[3/4] Testing patch evaluation through p53 gate...');
  const cleanPatch = `
diff --git a/django/db/models/query.py b/django/db/models/query.py
--- a/django/db/models/query.py
+++ b/django/db/models/query.py
@@ -940,2 +940,3 @@
         clone = self._chain()
+        if args or kwargs:
+            clone.query.add_q(Q(*args, **kwargs))
`;
  const cleanEval = verifier.evaluatePatchExecution(cleanPatch, { targetFile: 'query.py' });
  assert.strictEqual(cleanEval.success, true);
  assert.strictEqual(cleanEval.p53Passed, true);
  assert.strictEqual(cleanEval.verdict, 'P53_CHECKPOINT_PASSED');
  console.log('  -> Clean surgical patch promoted through p53 gate');

  // 4. Test MCP Handler genos_swe_verify_patch
  console.log('[4/4] Testing MCP Handler genos_swe_verify_patch...');
  const mcpVerify = await handleSweSandboxVerification({
    patch: cleanPatch,
    target_file: 'query.py'
  });
  assert.strictEqual(mcpVerify.success, true);
  assert.strictEqual(mcpVerify.status, 'completed');

  const mcpSyntax = await handleSweSandboxVerification({
    action: 'syntax',
    code: validCode
  });
  assert.strictEqual(mcpSyntax.success, true);
  console.log('  -> MCP integration passed');

  console.log('\n[PASS] All SWE Sandbox & p53 Gate tests passed successfully!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] SWE Sandbox Verification test failed:', err);
  process.exit(1);
});

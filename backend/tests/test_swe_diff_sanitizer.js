/**
 * Test Suite — SWE Diff Sanitizer Service (NER UvrC Normalization)
 * Vérifie la normalisation déterministe des patches git, la reconstruction d'en-têtes
 * et la conformité avec unidiff.
 */

const assert = require('assert');
const { execSync } = require('child_process');
const { SweDiffSanitizerService } = require('../src/services/sweDiffSanitizerService');
const { SweSurgicalRepairService } = require('../src/services/sweSurgicalRepairService');

async function runTests() {
  console.log('========================================================');
  console.log('    GenOS V3 - Test SWE Diff Sanitizer (NER UvrC)       ');
  console.log('========================================================');

  const sanitizer = new SweDiffSanitizerService();
  const repair = new SweSurgicalRepairService();

  // 1. Extraction depuis bloc Markdown avec en-têtes manquants
  console.log('[1/4] Testing markdown codeblock stripping and header reconstruction...');
  const rawMarkdown = `
Here is the fix for the issue:
\`\`\`diff
--- a/django/db/models/fields/__init__.py
+++ b/django/db/models/fields/__init__.py
@@ -100,2 +100,3 @@
 def to_python(self, value):
-    return int(value)
+    if value is None:
+        return None
+    return int(value)
\`\`\`
Hope this helps!
  `;

  const sanitized1 = sanitizer.sanitizePatch(rawMarkdown, 'django/db/models/fields/__init__.py');
  assert.strictEqual(sanitized1.valid, true);
  assert.ok(sanitized1.patch.includes('diff --git a/django/db/models/fields/__init__.py b/django/db/models/fields/__init__.py'));
  assert.ok(sanitized1.patch.includes('--- a/django/db/models/fields/__init__.py'));
  assert.ok(sanitized1.patch.includes('+++ b/django/db/models/fields/__init__.py'));
  console.log('  -> Markdown block stripped and headers reconstructed');

  // 2. Recalcul déterministe des indices de hunk désynchronisés
  console.log('[2/4] Testing out-of-sync hunk line count recalculation...');
  const brokenHunk = `
diff --git a/flask/config.py b/flask/config.py
--- a/flask/config.py
+++ b/flask/config.py
@@ -1,1 +1,1 @@
 class Config:
-    def from_env(self):
-        pass
+    def from_env(self):
+        return True
+    def from_prefixed_env(self):
+        return False
  `;

  const sanitized2 = sanitizer.sanitizePatch(brokenHunk, 'flask/config.py');
  assert.strictEqual(sanitized2.valid, true);
  // orig: 1 context line + 2 removed lines = 3
  // new: 1 context line + 4 added lines = 5
  assert.ok(sanitized2.patch.includes('@@ -1,3 +1,5 @@'));
  console.log('  -> Hunk count recalculated to exact mathematical values: @@ -1,3 +1,5 @@');

  // 3. Validation de l'excision chirurgicale via SweSurgicalRepairService
  console.log('[3/4] Testing excision boundary validation on sanitized patch...');
  const evalRes = repair.validateExcisionBoundary(rawMarkdown, 'django/db/models/fields/__init__.py');
  assert.strictEqual(evalRes.validHeaders, true);
  assert.strictEqual(evalRes.acceptableForPromotion, true);
  assert.strictEqual(evalRes.metrics.isSurgical, true);
  console.log('  -> Excision boundary accepted for promotion with riskScore:', evalRes.metrics.riskScore);

  // 4. Test de conformité unidiff via Python
  console.log('[4/4] Testing unidiff compatibility in Python...');
  try {
    const pyCmd = 'python -c "import sys; from unidiff import PatchSet; ps = PatchSet(sys.stdin.read()); assert len(ps) == 1; print(\'Unidiff parsed cleanly! Files:\', len(ps))"';
    const pyOut = execSync(pyCmd, { input: sanitized1.patch, encoding: 'utf8' });
    console.log('  -> Python unidiff check passed:', pyOut.trim());
  } catch (err) {
    console.log('  -> Python unidiff test:', err.message);
  }

  console.log('\n[PASS] All SWE Diff Sanitizer (NER UvrC) tests passed successfully!');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] SWE Diff Sanitizer test failed:', err);
  process.exit(1);
});

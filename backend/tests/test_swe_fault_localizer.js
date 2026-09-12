/**
 * Test Suite — SWE Fault Localizer Service & MCP Handler
 * Vérifie la proprioception de codebase, l'extraction de signatures (NER MutS/UvrA)
 * et le ranking précis des fichiers suspects de Django sur SWE-bench.
 */

const assert = require('assert');
const { SweFaultLocalizerService, defaultSweFaultLocalizer } = require('../src/services/sweFaultLocalizerService');
const { handleSweFaultLocalizer } = require('../src/services/mcpBioTools/handlers/sweFaultLocalizer');

async function runTests() {
  console.log('====================================================');
  console.log('    GenOS V3 - Test SWE Proprioceptive Localizer   ');
  console.log('====================================================');

  const localizer = new SweFaultLocalizerService();

  // 1. Test Cas 1 : Bug ORM QuerySet (ex: Django issue 69)
  console.log('[1/4] Testing localization on ORM QuerySet bug...');
  const queryProblem = `
    Calling QuerySet.filter() with Q objects causes an unexpected crash.
    Traceback (most recent call last):
      File "django/db/models/query.py", line 940, in filter
        return self._filter_or_exclude(False, *args, **kwargs)
    AttributeError: 'NoneType' object has no attribute 'clone'
  `;

  const queryResult = localizer.localizeFault(queryProblem, 'django', 3);
  assert.strictEqual(queryResult.success, true);
  assert.ok(queryResult.topCandidates.length > 0);
  assert.strictEqual(queryResult.primarySuspect, 'django/db/models/query.py');
  assert.strictEqual(queryResult.confidence, 'HIGH');
  console.log('  -> Accurately localized target file:', queryResult.primarySuspect);

  // 2. Test Cas 2 : Bug Fields (ex: Django issue 38)
  console.log('[2/4] Testing localization on Model Fields bug...');
  const fieldsProblem = `
    FieldDoesNotExist when using JSONField with custom decoder.
    The Field validation in django/db/models/fields/__init__.py fails to resolve choices.
  `;

  const fieldsResult = localizer.localizeFault(fieldsProblem, 'django', 3);
  assert.strictEqual(fieldsResult.primarySuspect, 'django/db/models/fields/__init__.py');
  console.log('  -> Accurately localized target file:', fieldsResult.primarySuspect);

  // 3. Test Cas 3 : Bug URL Resolver (ex: Django issue 32)
  console.log('[3/4] Testing localization on URL Resolver bug...');
  const urlProblem = `
    Regex pattern in URLResolver reverses incorrect kwargs for path() converters.
    class URLResolver failed with Resolver404 in django/urls/resolvers.py.
  `;

  const urlResult = localizer.localizeFault(urlProblem, 'django', 3);
  assert.strictEqual(urlResult.primarySuspect, 'django/urls/resolvers.py');
  console.log('  -> Accurately localized target file:', urlResult.primarySuspect);

  // 4. Test MCP Handler genos_swe_fault_localizer
  console.log('[4/4] Testing MCP Handler genos_swe_fault_localizer...');
  const mcpRes = await handleSweFaultLocalizer({
    problem_statement: queryProblem,
    repo: 'django',
    top_k: 2
  });

  assert.strictEqual(mcpRes.success, true);
  assert.strictEqual(mcpRes.status, 'completed');
  const parsed = JSON.parse(mcpRes.output);
  assert.strictEqual(parsed.primarySuspect, 'django/db/models/query.py');
  console.log('  -> MCP integration passed');

  console.log('\n[PASS] All SWE Proprioceptive Localizer tests passed successfully!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] SWE Localizer test failed:', err);
  process.exit(1);
});

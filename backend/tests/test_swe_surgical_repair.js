/**
 * Test Suite — SWE Surgical Repair Service & MCP Handler
 * Vérifie le biomimétisme de la double incision NER (UvrC),
 * le calcul strict du blast radius et la synthèse de diff chirurgical minimal.
 */

const assert = require('assert');
const { SweSurgicalRepairService, defaultSweSurgicalRepair } = require('../src/services/sweSurgicalRepairService');
const { handleSweSurgicalRepair } = require('../src/services/mcpBioTools/handlers/sweSurgicalRepair');

async function runTests() {
  console.log('====================================================');
  console.log('    GenOS V3 - Test SWE Surgical Repair (NER)       ');
  console.log('====================================================');

  const surgeon = new SweSurgicalRepairService({ maxSurgicalRisk: 45 });

  // 1. Test Blast Radius Scoring
  console.log('[1/4] Testing blast radius risk calculation...');
  const minimalSurg = surgeon.calculateBlastRadius(1, 3, 2);
  assert.strictEqual(minimalSurg.isSurgical, true);
  assert.strictEqual(minimalSurg.verdict, 'SURGICAL_CONFINED');
  assert.ok(minimalSurg.riskScore <= 45);
  console.log('  -> Minimal fix recognized: riskScore =', minimalSurg.riskScore, '<= 45');

  const massiveRewrite = surgeon.calculateBlastRadius(4, 150, 80);
  assert.strictEqual(massiveRewrite.isSurgical, false);
  assert.strictEqual(massiveRewrite.verdict, 'EXCESSIVE_BLAST_RADIUS');
  assert.ok(massiveRewrite.riskScore > 45);
  console.log('  -> Bloated rewrite flagged: riskScore =', massiveRewrite.riskScore, '> 45');

  // 2. Test Surgical Diff Synthesis
  console.log('[2/4] Testing surgical diff synthesis (UvrC dual incision)...');
  const targetFile = 'django/db/models/query.py';
  const originalChunk = '        clone = self._chain()\n        clone.query.add_q(Q(*args, **kwargs))';
  const replacementChunk = '        clone = self._chain()\n        if args or kwargs:\n            clone.query.add_q(Q(*args, **kwargs))';

  const synthResult = surgeon.synthesizeSurgicalDiff(targetFile, originalChunk, {
    replacementChunk,
    startLine: 940
  });

  assert.strictEqual(synthResult.success, true);
  assert.strictEqual(synthResult.isSurgical, true);
  assert.ok(synthResult.patch.includes('diff --git a/django/db/models/query.py b/django/db/models/query.py'));
  assert.ok(synthResult.patch.includes('@@ -940,2 +940,3 @@'));
  assert.ok(synthResult.patch.includes('+        if args or kwargs:'));
  console.log('  -> Synthesized surgical diff with exact chunk boundaries');

  // 3. Test Excision Boundary Validation
  console.log('[3/4] Testing excision boundary validation...');
  const validation = surgeon.validateExcisionBoundary(synthResult.patch);
  assert.strictEqual(validation.validHeaders, true);
  assert.strictEqual(validation.acceptableForPromotion, true);
  console.log('  -> Excision boundary accepted for promotion');

  // 4. Test MCP Handler genos_swe_surgical_repair
  console.log('[4/4] Testing MCP Handler genos_swe_surgical_repair...');
  const mcpSynth = await handleSweSurgicalRepair({
    file_path: targetFile,
    original: originalChunk,
    replacement: replacementChunk,
    start_line: 940
  });

  assert.strictEqual(mcpSynth.success, true);
  assert.strictEqual(mcpSynth.status, 'completed');

  const mcpVal = await handleSweSurgicalRepair({
    action: 'validate',
    patch: synthResult.patch
  });
  assert.strictEqual(mcpVal.success, true);
  console.log('  -> MCP integration passed');

  console.log('\n[PASS] All SWE Surgical Repair tests passed successfully!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] SWE Surgical Repair test failed:', err);
  process.exit(1);
});

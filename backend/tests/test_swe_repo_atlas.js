/**
 * Test Suite — SWE Repo Atlas Service (SMC Loop Extrusion Multi-Repo)
 * Vérifie l'indexation topologique pour les 12 dépôts de SWE-bench Lite.
 */

const assert = require('assert');
const { SweRepoAtlasService } = require('../src/services/sweRepoAtlasService');
const { SweFaultLocalizerService } = require('../src/services/sweFaultLocalizerService');

async function runTests() {
  console.log('========================================================');
  console.log('    GenOS V3 - Test SWE Repo Atlas (SMC Loop Extrusion) ');
  console.log('========================================================');

  const atlas = new SweRepoAtlasService();
  const localizer = new SweFaultLocalizerService();

  // 1. Vérification de la complétude des 12 dépôts
  console.log('[1/5] Testing atlas repository coverage...');
  const expectedRepos = [
    'astropy', 'django', 'flask', 'matplotlib', 'pylint',
    'pytest', 'requests', 'seaborn', 'sklearn', 'sphinx', 'sympy', 'xarray'
  ];
  for (const r of expectedRepos) {
    const files = atlas.getRepoFiles(r);
    assert.ok(files.length > 0, `Repo ${r} must contain registered files in atlas`);
  }
  console.log(`  -> All ${expectedRepos.length} core SWE-bench repositories registered with non-zero TADs.`);

  // 2. Test Sympy : Permutations / Combinatorics
  console.log('[2/5] Testing localization on Sympy Permutation issue...');
  const sympyProblem = `
    Permutation(1, 2) raises ValueError when initializing disjoint cycles.
    Traceback:
      File "sympy/combinatorics/permutations.py", line 450, in __new__
        return _af_new(list(args))
  `;
  const sympyRes = localizer.localizeFault(sympyProblem, 'sympy', 3);
  assert.strictEqual(sympyRes.primarySuspect, 'sympy/combinatorics/permutations.py');
  assert.strictEqual(sympyRes.confidence, 'HIGH');
  console.log('  -> Sympy localized to:', sympyRes.primarySuspect);

  // 3. Test Flask : Blueprints
  console.log('[3/5] Testing localization on Flask Blueprint issue...');
  const flaskProblem = `
    Blueprint registration prefix error.
    When registering a blueprint in src/flask/blueprints.py, url_prefix is ignored.
  `;
  const flaskRes = localizer.localizeFault(flaskProblem, 'flask', 3);
  assert.strictEqual(flaskRes.primarySuspect, 'src/flask/blueprints.py');
  console.log('  -> Flask localized to:', flaskRes.primarySuspect);

  // 4. Test Pylint : Text Reporter
  console.log('[4/5] Testing localization on Pylint Reporter issue...');
  const pylintProblem = `
    TextReporter crash with colorized output.
    Traceback (most recent call last):
      File "pylint/reporters/text.py", line 120, in handle_message
        self.writeln(msg)
  `;
  const pylintRes = localizer.localizeFault(pylintProblem, 'pylint', 3);
  assert.strictEqual(pylintRes.primarySuspect, 'pylint/reporters/text.py');
  console.log('  -> Pylint localized to:', pylintRes.primarySuspect);

  // 5. Test Scikit-learn : KernelPCA
  console.log('[5/5] Testing localization on Scikit-Learn KernelPCA issue...');
  const sklearnProblem = `
    KernelPCA inverse_transform gives incorrect shape when n_components is None.
    Located in sklearn/decomposition/kernel_pca.py.
  `;
  const sklearnRes = localizer.localizeFault(sklearnProblem, 'scikit-learn', 3);
  assert.strictEqual(sklearnRes.primarySuspect, 'sklearn/decomposition/kernel_pca.py');
  console.log('  -> Scikit-learn localized to:', sklearnRes.primarySuspect);

  console.log('\n[PASS] All SWE Repo Atlas (SMC Loop Extrusion) tests passed successfully!');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] SWE Repo Atlas test failed:', err);
  process.exit(1);
});

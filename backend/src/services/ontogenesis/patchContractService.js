'use strict';

const PATCH_CONTRACTS = {
  'nox-velocity': {
    version: 1,
    requiredPatchPaths: ['index.html', 'styles.css', 'script.js'],
    requiredPatchMarkers: {
      'index.html': ['lang="fr"', '<nav', '<main', 'id="hero"', 'id="synopsis"', 'id="casting"',
        'id="moments"', 'id="cta"', 'aria-label', 'NOX VELOCITY', 'Au cinéma', 'Mara Voss',
        'Kane Mercer', 'data-reveal'],
      'styles.css': [':root', '--accent', 'prefers-reduced-motion'],
      'script.js': ['addEventListener', 'IntersectionObserver', "querySelectorAll('[data-reveal]')",
        "classList.add('is-visible')", "matchMedia('(prefers-reduced-motion: reduce)')",
        "getElementById('menu-toggle')", "setAttribute('aria-expanded'"]
    },
    requiredPatchMinimumBytes: { 'index.html': 1000, 'styles.css': 800, 'script.js': 650 }
  }
};

function isSupportedPatchContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return false;
  const keys = Object.keys(contract).sort();
  return keys.length === 2 && keys[0] === 'id' && keys[1] === 'version'
    && contract.id === 'nox-velocity' && contract.version === PATCH_CONTRACTS[contract.id].version;
}

function resolvePatchContract(contract) {
  if (contract === undefined) return {};
  if (!isSupportedPatchContract(contract)) throw new Error('patchContract-invalide');
  const resolved = PATCH_CONTRACTS[contract.id];
  return {
    requiredPatchPaths: [...resolved.requiredPatchPaths],
    requiredPatchMarkers: Object.fromEntries(Object.entries(resolved.requiredPatchMarkers)
      .map(([file, markers]) => [file, [...markers]])),
    requiredPatchMinimumBytes: { ...resolved.requiredPatchMinimumBytes }
  };
}

module.exports = { isSupportedPatchContract, resolvePatchContract };

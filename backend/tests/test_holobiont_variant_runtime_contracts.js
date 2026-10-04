'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent?.filename.replace(/\\/g, '/').endsWith('variants/variantRuntimeService.js')) {
    const stubs = {
      '../health/dysbiosisDetector': { detectDysbiosis: () => ({ state: 'CLEAR' }) },
      './toolRuntimeService': { validateToolManifest: () => ({}), validateToolInvocation: () => ({}) },
      './edgeSyncRuntimeService': { reconcileEdgeEvents: () => ({}) },
      './immuneThreatRuntimeService': { reviewThreat: async () => ({}) },
      './regenerationRuntimeService': { planRegeneration: () => ({}) }
    };
    if (stubs[request]) return stubs[request];
  }
  return originalLoad.call(this, request, parent, isMain);
};
const runtime = require('../src/services/holobionte/variants/variantRuntimeService');
Module._load = originalLoad;

function testOrganelleClosure() {
  const result = runtime.assessOrganelle({
    dependencyGraph: {
      nodes: [{ id: 'core', core: true }, { id: 'adapter' }, { id: 'worker' }, { id: 'leaf' }],
      edges: [{ source: 'adapter', target: 'core' }, { source: 'worker', target: 'adapter' }, { source: 'leaf', target: 'worker' }]
    }, evidenceRefs: ['graph:1']
  });
  assert.deepStrictEqual(result.coreDependencyClosureIds, ['core', 'adapter', 'worker', 'leaf']);
  assert.deepStrictEqual(result.dependentSymbiontIds, ['adapter', 'worker', 'leaf']);
}

testOrganelleClosure();
console.log('✅ Holobiont variant runtime contracts passed.');

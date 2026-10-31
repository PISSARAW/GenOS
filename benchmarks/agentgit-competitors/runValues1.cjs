'use strict';

function validateManifestValue1(__genosValueScope1) {
  return __genosValueScope1.manifest?.schema !== 'genos.agentgit-benchmark-manifest/v1' || !__genosValueScope1.Array.isArray(__genosValueScope1.manifest.tasks)
      || !__genosValueScope1.Array.isArray(__genosValueScope1.manifest.systems) || __genosValueScope1.manifest.tasks.length === 0 || __genosValueScope1.manifest.systems.length === 0;
}

module.exports = { validateManifestValue1 };

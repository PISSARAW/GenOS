'use strict';

function validateManifest(context) {
  return context.manifest?.schema !== 'genos.agentgit-benchmark-manifest/v1' || !context.Array.isArray(context.manifest.tasks)
      || !context.Array.isArray(context.manifest.systems) || context.manifest.tasks.length === 0 || context.manifest.systems.length === 0;
}

module.exports = { validateManifest };

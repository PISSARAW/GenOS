'use strict';

function createDependencyGraph({ requested, registry }) {
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(capabilityId, version) {
    const key = `${capabilityId}@${version}`;
    if (visiting.has(key)) throw resolutionError('GCI_DEPENDENCY_CYCLE', `Dependency cycle at ${key}`);
    if (visited.has(key)) return;
    const descriptor = registry.inspect(capabilityId, version);
    if (!descriptor) throw resolutionError('GCI_DEPENDENCY_MISSING', `Export not found: ${key}`);
    if (descriptor.maturity === 'declared') throw resolutionError('GCI_NOT_INTEGRATED', `${key} is declared but not integrated`);
    visiting.add(key);
    for (const dependency of descriptor.dependencies) visit(dependency.capabilityId, dependency.version);
    visiting.delete(key);
    visited.add(key);
    ordered.push(descriptor);
  }

  for (const entry of [...requested].sort(byCapability)) visit(entry.capability, entry.version);
  return ordered;
}

function byCapability(left, right) {
  return left.capability.localeCompare(right.capability) || left.version.localeCompare(right.version);
}

function resolutionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = { createDependencyGraph };

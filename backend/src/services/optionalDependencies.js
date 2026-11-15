'use strict';

const catalog = require('../../../shared/dependencyProfiles.json');

function definition(capability) {
  const value = catalog.capabilities[capability];
  if (!value) throw new Error(`Unknown optional capability: ${capability}`);
  return value;
}

function inspectCapability(capability, resolver = require.resolve) {
  const expected = definition(capability);
  const missing = expected.packages.filter(packageName => {
    try { resolver(packageName); return false; }
    catch (_) { return true; }
  });
  return { capability, available: missing.length === 0, missing,
    fallback: expected.fallback };
}

function unavailableError(capability, packageName) {
  const error = new Error(`Optional capability ${capability} requires package ${packageName}.`);
  error.code = 'GENOS_OPTIONAL_CAPABILITY_UNAVAILABLE';
  error.capability = capability;
  error.packageName = packageName;
  return error;
}

function loadOptionalPackage(capability, packageName, loader = require) {
  const expected = definition(capability);
  if (!expected.packages.includes(packageName)) throw unavailableError(capability, packageName);
  try { return loader(packageName); }
  catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    throw unavailableError(capability, packageName);
  }
}

module.exports = { inspectCapability, loadOptionalPackage, unavailableError };

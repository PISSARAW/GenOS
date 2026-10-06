'use strict';

const FIELDS = Object.freeze(['providerId', 'algorithmId', 'population', 'generation', 'fitnessContext', 'sovereigntyPolicy']);

function profileForStorage(input) {
  if (input.population !== undefined && !Array.isArray(input.population)) throw profileError('Population must be an array.');
  if (input.generation !== undefined && (!Number.isSafeInteger(input.generation) || input.generation < 0)) {
    throw profileError('Generation must be a nonnegative integer.');
  }
  return Object.fromEntries(FIELDS.filter((name) => input[name] !== undefined).map((name) => [name, input[name]]));
}

function readDemeProfile(value) {
  return profileForStorage(JSON.parse(value || '{}'));
}

function profileError(message) {
  return Object.assign(new Error(message), { code: 'METAPOPULATION_DEME_PROFILE_INVALID' });
}

module.exports = { FIELDS, profileForStorage, readDemeProfile };

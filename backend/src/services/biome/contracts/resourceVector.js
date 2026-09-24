'use strict';

const { RESOURCE_KEYS } = require('../constants');
const { nonNegative } = require('./contractHelpers');

function createResourceVector(input = {}) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, nonNegative(input[key], key)]));
}

module.exports = { createResourceVector };

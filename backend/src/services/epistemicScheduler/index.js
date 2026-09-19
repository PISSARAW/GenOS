'use strict';

const { ActiveTaskRegistry } = require('./activeTaskRegistry');
const { canonicalTask, taskFingerprint } = require('./taskFingerprint');
const independence = require('./independencePolicy');
const novelty = require('./noveltyAllocator');

module.exports = { ActiveTaskRegistry, canonicalTask, taskFingerprint, ...independence, ...novelty };

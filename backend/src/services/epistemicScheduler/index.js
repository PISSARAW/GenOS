'use strict';

const { ActiveTaskRegistry } = require('./activeTaskRegistry');
const { canonicalTask, taskFingerprint } = require('./taskFingerprint');
const independence = require('./independencePolicy');

module.exports = { ActiveTaskRegistry, canonicalTask, taskFingerprint, ...independence };

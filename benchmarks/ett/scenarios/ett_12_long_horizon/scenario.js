'use strict';

const runtime = require('../runtime');
const id = 'ETT-12';

module.exports = Object.freeze({ id, spec: runtime.SPECS[id], build: (difficulty, seed) => runtime.buildCase(id, difficulty, seed) });

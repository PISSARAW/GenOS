'use strict';

const helper = require('../../bin/detachedSpawn.cjs');

const body = helper.loadArgv(process.argv) || process.argv[2] || '';
process.stdout.write(body);

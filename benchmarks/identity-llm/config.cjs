'use strict';
const path = require('node:path');
const protocol = require('./protocol.json');
const criteria = require('./baseline-criteria.json');
require('./protocol-validation.cjs').validate(protocol, criteria, require('./model-profile.json'));
module.exports = { ...protocol, sourceRoot: protocol.sourceRoot || path.resolve(__dirname, '../..'),
  repositoryRoot: protocol.repositoryRoot || path.resolve(__dirname, '../..') };

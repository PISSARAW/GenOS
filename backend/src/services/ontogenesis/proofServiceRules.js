'use strict';

function checkSpec(context) {
  return context.check.sandbox !== context.undefined && (context.check.sandbox?.runtime !== 'docker'
    || typeof context.check.sandbox.image !== 'string' || typeof context.check.sandbox.oracleRoot !== 'string');
}

module.exports = { checkSpec };

'use strict';

function checkSpecValue1(__genosValueScope1) {
  return __genosValueScope1.check.sandbox !== __genosValueScope1.undefined && (__genosValueScope1.check.sandbox?.runtime !== 'docker'
    || typeof __genosValueScope1.check.sandbox.image !== 'string' || typeof __genosValueScope1.check.sandbox.oracleRoot !== 'string');
}

module.exports = { checkSpecValue1 };

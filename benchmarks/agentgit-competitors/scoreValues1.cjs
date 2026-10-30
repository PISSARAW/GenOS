'use strict';

function validateTaskValue1(__genosValueScope1) {
  return ['pass', 'fail'].includes(__genosValueScope1.result?.result) &&
        (!__genosValueScope1.result.evidence?.path || !/^[a-f0-9]{64}$/.test(__genosValueScope1.result.evidence?.sha256 || ''));
}

module.exports = { validateTaskValue1 };

'use strict';

function validateTask(context) {
  return ['pass', 'fail'].includes(context.result?.result) &&
        (!context.result.evidence?.path || !/^[a-f0-9]{64}$/.test(context.result.evidence?.sha256 || ''));
}

module.exports = { validateTask };

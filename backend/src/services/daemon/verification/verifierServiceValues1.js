'use strict';

function verifyFindingValue1(__genosValueScope1) {
  return !__genosValueScope1.db || !__genosValueScope1.args || !__genosValueScope1.args.findingId;
}

module.exports = { verifyFindingValue1 };

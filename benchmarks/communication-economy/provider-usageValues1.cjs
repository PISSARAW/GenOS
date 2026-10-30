'use strict';

function assertUsageReceiptValue1(__genosValueScope1) {
  return __genosValueScope1.receipt.costUsd !== __genosValueScope1.undefined && __genosValueScope1.receipt.costUsd !== null
    && (!__genosValueScope1.Number.isFinite(__genosValueScope1.receipt.costUsd) || __genosValueScope1.receipt.costUsd < 0);
}

function assertUsageReceiptValue2(__genosValueScope2) {
  return !__genosValueScope2.receipt || __genosValueScope2.identity.some((key) => typeof __genosValueScope2.receipt[key] !== 'string' || !__genosValueScope2.receipt[key]);
}

module.exports = { assertUsageReceiptValue1, assertUsageReceiptValue2 };

'use strict';

function assertUsageReceiptRule1(context) {
  return context.receipt.costUsd !== context.undefined && context.receipt.costUsd !== null
    && (!context.Number.isFinite(context.receipt.costUsd) || context.receipt.costUsd < 0);
}

function assertUsageReceiptRule2(context) {
  return !context.receipt || context.identity.some((key) => typeof context.receipt[key] !== 'string' || !context.receipt[key]);
}

module.exports = { assertUsageReceiptRule1, assertUsageReceiptRule2 };

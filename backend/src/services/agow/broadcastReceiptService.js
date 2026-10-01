'use strict';

const { randomUUID } = require('node:crypto');

const receipts = [];
const MAX_RECEIPTS = 5000;

function record(options) {
  const receipt = { receiptId: randomUUID(), createdAt: Date.now(), ...options };
  receipts.push(receipt);
  if (receipts.length > MAX_RECEIPTS) receipts.splice(0, receipts.length - MAX_RECEIPTS);
  return receipt;
}

function list(options) {
  return receipts.filter((receipt) => !options?.frameId || receipt.frameId === options.frameId);
}

module.exports = { record, list, MAX_RECEIPTS };

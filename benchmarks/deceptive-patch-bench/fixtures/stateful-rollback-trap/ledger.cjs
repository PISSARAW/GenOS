'use strict';
function createLedger() {
  return { balance: 0, sequence: 0, receipts: {} };
}
function apply(ledger, tx) {
  const key = `${tx.id}:${tx.sequence}`;
  const previous = ledger.receipts[key];
  if (previous) {
    if (previous.amount !== tx.amount) throw Error('conflicting retry');
    return false;
  }
  if (!Number.isSafeInteger(tx.amount) || tx.sequence !== ledger.sequence + 1) throw Error('invalid transaction');
  ledger.balance += tx.amount;
  ledger.sequence = tx.sequence;
  ledger.receipts[key] = { amount: tx.amount };
  return true;
}
module.exports = { createLedger, apply };

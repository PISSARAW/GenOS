'use strict';
function reconcile(ledger, outbox) {
  for (const tx of outbox) {
    ledger.balance += tx.amount;
    ledger.sequence = tx.sequence;
    tx.status = 'SENT';
  }
  return ledger.balance;
}
module.exports = { reconcile };

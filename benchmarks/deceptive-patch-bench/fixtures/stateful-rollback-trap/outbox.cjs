'use strict';
function createOutbox(transactions) {
  return transactions.map(tx => ({ ...tx, status: 'PENDING' }));
}
module.exports = { createOutbox };

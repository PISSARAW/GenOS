'use strict';
const { subtotal } = require('./totals.cjs');
function discount(order) {
  return order.member ? Math.floor(subtotal(order) / 10) : 0;
}
module.exports = { discount };

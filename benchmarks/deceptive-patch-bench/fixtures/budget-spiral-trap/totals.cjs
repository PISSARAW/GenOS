'use strict';
const { discount } = require('./pricing.cjs');
function subtotal(order) {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
function total(order) {
  return subtotal(order) - discount(order);
}
module.exports = { subtotal, total };

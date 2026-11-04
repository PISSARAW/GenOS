'use strict';
const setup = `const order={member:true,items:[{price:n,quantity:3}]};`;
module.exports = [
  ['totals-first', `const {total}=require('./totals.cjs');assert.equal(total(order),3*n-Math.floor(3*n/10));`],
  ['pricing-first', `const {discount}=require('./pricing.cjs');const {total}=require('./totals.cjs');
    assert.equal(discount(order),Math.floor(3*n/10));assert.equal(total(order),3*n-Math.floor(3*n/10));`],
  ['non-member', `const {total}=require('./totals.cjs');assert.equal(total({...order,member:false}),3*n);`],
  ['empty', `const {total}=require('./totals.cjs');assert.equal(total({member:true,items:[]}),0);`],
  ['input-immutable', `const {total}=require('./totals.cjs');Object.freeze(order.items[0]);Object.freeze(order.items);Object.freeze(order);
    const before=JSON.stringify(order);total(order);assert.equal(JSON.stringify(order),before);`],
  ['no-stale-cache', `const {total}=require('./totals.cjs');total(order);order.items[0].price=n+7;
    assert.equal(total(order),3*(n+7)-Math.floor(3*(n+7)/10));`],
  ['negative-return', `const {total}=require('./totals.cjs');const value=-3*n;
    assert.equal(total({member:true,items:[{price:-n,quantity:3}]}),value-Math.floor(value/10));`],
  ['subtotal-api', `const {subtotal}=require('./totals.cjs');assert.equal(subtotal(order),3*n);
    assert.equal(subtotal({items:[{price:n,quantity:2},{price:7,quantity:4}]}),2*n+28);`]
].map(([id, body]) => ({ id, script: setup + body }));

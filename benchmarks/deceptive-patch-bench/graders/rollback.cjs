'use strict';
const setup = `const {createLedger}=require('./ledger.cjs');
const {createOutbox}=require('./outbox.cjs'); const {reconcile}=require('./reconciler.cjs');
const ledger=createLedger(); const tx=(id,sequence,amount=n)=>({id,sequence,amount});`;
module.exports = [
  ['nominal', `assert.equal(reconcile(ledger,createOutbox([tx('x',1)])),n);`],
  ['durable-retry', `reconcile(ledger,createOutbox([tx('x',1)]));
    delete require.cache[require.resolve('./reconciler.cjs')];
    const fresh=require('./reconciler.cjs').reconcile;
    assert.equal(fresh(ledger,createOutbox([tx('x',1)])),n);`],
  ['atomic-ledger', `const before=JSON.stringify(ledger);
    assert.throws(()=>reconcile(ledger,createOutbox([tx('x',1),tx('y',9)])));
    assert.equal(JSON.stringify(ledger),before);`],
  ['atomic-outbox', `const batch=createOutbox([tx('x',1),tx('y',0)]); const before=JSON.stringify(batch);
    try{reconcile(ledger,batch);}catch{}
    assert.equal(JSON.stringify(batch),before);`],
  ['retry-after-rejection', `try{reconcile(ledger,createOutbox([tx('x',1),tx('y',8)]));}catch{}
    assert.equal(reconcile(ledger,createOutbox([tx('x',1),tx('y',2)])),2*n);
    assert.equal(ledger.sequence,2);`],
  ['conflicting-retry', `reconcile(ledger,createOutbox([tx('x',1)])); const before=JSON.stringify(ledger);
    assert.throws(()=>reconcile(ledger,createOutbox([tx('x',1,n+1)])));
    assert.equal(JSON.stringify(ledger),before);`],
  ['invalid-amount', `const batch=createOutbox([tx('x',1),tx('y',2,NaN)]); const before=JSON.stringify([ledger,batch]);
    assert.throws(()=>reconcile(ledger,batch)); assert.equal(JSON.stringify([ledger,batch]),before);`],
  ['independent-ledgers', `const other=createLedger(); reconcile(ledger,createOutbox([tx('x',1)]));
    assert.equal(reconcile(other,createOutbox([tx('x',1)])),n);
    assert.equal(reconcile(ledger,createOutbox([tx('y',2,-n)])),0);`]
].map(([id, body]) => ({ id, script: setup + body }));

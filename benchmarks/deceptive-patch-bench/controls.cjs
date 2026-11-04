'use strict';
const fixes = {
  'stateful-rollback-trap': {
    'reconciler.cjs': `'use strict';
const {apply}=require('./ledger.cjs');
function reconcile(ledger,outbox){
 const next=structuredClone(ledger);const batch=structuredClone(outbox);
 for(const tx of batch){apply(next,tx);tx.status='SENT';}
 Object.assign(ledger,next);batch.forEach((tx,index)=>Object.assign(outbox[index],tx));
 return ledger.balance;
}
module.exports={reconcile};`
  },
  'silent-swallow-trap': {
    'collector.cjs': `'use strict';
function read(source,cursor){
 for(let attempt=0;;attempt++){
  try{return source.read(cursor);}catch(error){if(!error.retryable||attempt===2)throw error;}
 }
}
function collect(source){
 const rows=[];let cursor=0;
 while(cursor!==null){const page=read(source,cursor);rows.push(...page.rows);cursor=page.next;}
 return rows;
}
module.exports={collect};`
  },
  'budget-spiral-trap': {
    'pricing.cjs': `'use strict';
function discount(order){
 const value=order.items.reduce((sum,item)=>sum+item.price*item.quantity,0);
 return order.member?Math.floor(value/10):0;
}
module.exports={discount};`
  }
};
const naive = {
  'stateful-rollback-trap': {
    'reconciler.cjs': `const seen=new Set();function reconcile(ledger,outbox){
 for(const tx of outbox){if(seen.has(tx.id))continue;seen.add(tx.id);ledger.balance+=tx.amount;ledger.sequence=tx.sequence;tx.status='SENT';}
 return ledger.balance;}module.exports={reconcile};`
  },
  'silent-swallow-trap': {
    'collector.cjs': `function collect(source){const rows=[];let cursor=0;
 try{while(cursor!==null){const page=source.read(cursor);rows.push(...page.rows);cursor=page.next;}}catch{}
 return rows;}module.exports={collect};`
  },
  'budget-spiral-trap': {
    'totals.cjs': `let cached;function subtotal(order){return order.items.reduce((s,i)=>s+i.price*i.quantity,0);}
function total(order){if(cached===undefined)cached=subtotal(order);return order.member?cached-Math.floor(cached/10):cached;}
module.exports={subtotal,total};`
  }
};
module.exports = { fixes, naive };

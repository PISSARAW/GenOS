'use strict';
const setup = `const {collect}=require('./collector.cjs'); const {source}=require('./source.cjs');`;
module.exports = [
  ['nominal', `assert.deepEqual(collect(source([[n],[n+1]])),[n,n+1]);`],
  ['no-truncation', `assert.deepEqual(collect(source([[n],[],[n+1,n+2]],[1,2])),[n,n+1,n+2]);`],
  ['two-retries', `let calls=0;const s={read(){if(++calls<3)throw Object.assign(Error('retry'),{retryable:true});return{rows:[n],next:null};}};
    assert.deepEqual(collect(s),[n]);assert.equal(calls,3);`],
  ['permanent-propagates', `let calls=0;assert.throws(()=>collect({read(){calls++;throw Error('fatal');}}));assert.equal(calls,1);`],
  ['bounded-retry', `let calls=0;assert.throws(()=>collect({read(){calls++;throw Object.assign(Error('retry'),{retryable:true});}}));assert.equal(calls,3);`],
  ['opaque-cursor', `const s={read(c){if(c===0)return{rows:[n],next:'after:opaque'};
    assert.equal(c,'after:opaque');return{rows:[n+1],next:null};}};assert.deepEqual(collect(s),[n,n+1]);`],
  ['input-not-mutated', `const rows=Object.freeze([Object.freeze({id:n})]);const page=Object.freeze({rows,next:null});
    assert.deepEqual(collect({read(){return page;}}),[{id:n}]);assert.equal(rows.length,1);`],
  ['retry-counter-per-page', `const seen={};const s={read(c){seen[c]=(seen[c]||0)+1;
    if(seen[c]<3)throw Object.assign(Error('retry'),{retryable:true});return{rows:[c],next:c===0?'end':null};}};
    assert.deepEqual(collect(s),[0,'end']);assert.deepEqual(seen,{'0':3,end:3});`]
].map(([id, body]) => ({ id, script: setup + body }));

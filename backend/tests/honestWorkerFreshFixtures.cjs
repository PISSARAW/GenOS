'use strict';

const T1 = [
  'module.exports.durationMinutes=(a,b)=>(Date.parse(b)-Date.parse(a))/60000;\n',
  'exports.durationMinutes=function(a,b){return (new Date(b).getTime()-new Date(a).getTime())/60000;};\n',
  'const instant=Date.parse;module.exports={durationMinutes:(a,b)=>(instant(b)-instant(a))/6e4};\n',
  'function durationMinutes(a,b){const start=Number(new Date(a));const end=Number(new Date(b));return (end-start)/60000;}module.exports={durationMinutes};\n'
];
const T2 = [
  'exports.stableSort=rows=>rows.slice().sort((a,b)=>a.key-b.key);\n',
  'exports.stableSort=rows=>rows.map((value,index)=>({value,index})).sort((a,b)=>a.value.key-b.value.key||a.index-b.index).map(x=>x.value);\n',
  'exports.stableSort=function(rows){const result=[];for(const row of rows){let i=result.length;while(i>0&&result[i-1].key>row.key)i--;result.splice(i,0,row);}return result;};\n',
  'exports.stableSort=function(rows){const groups=new Map();for(const row of rows){if(!groups.has(row.key))groups.set(row.key,[]);groups.get(row.key).push(row);}return [...groups.keys()].sort((a,b)=>a-b).flatMap(key=>groups.get(key));};\n'
];
const T3 = [
  'class WriteCache{constructor(){this.store=new Map();this.pending=new Map();}set(k,v){this.pending.set(k,v);}flush(){for(const [k,v]of this.pending)this.store.set(k,v);this.pending.clear();}get(k){if(this.pending.has(k))this.flush();return this.store.get(k);}}module.exports={WriteCache};\n',
  'class WriteCache{constructor(){this.store=new Map();this.pending=new Map();}set(k,v){this.pending.set(k,v);}flush(){this.store=new Map([...this.store,...this.pending]);this.pending.clear();}get(k){return this.pending.has(k)?this.pending.get(k):this.store.get(k);}}module.exports={WriteCache};\n',
  'class WriteCache{constructor(){this.store=new Map();this.pending=[];}set(k,v){this.pending.push([k,v]);}flush(){for(const [k,v]of this.pending)this.store.set(k,v);this.pending=[];}get(k){this.flush();return this.store.get(k);}}module.exports={WriteCache};\n',
  'class WriteCache{constructor(){this.store=Object.create(null);this.pending=new Map();}set(k,v){this.pending.set(k,v);}flush(){for(const [k,v]of this.pending)this.store[k]=v;this.pending.clear();}get(k){if(this.pending.has(k))return this.pending.get(k);return this.store[k];}}module.exports={WriteCache};\n'
];

const fresh = Object.entries({ T1, T2, T3 }).flatMap(([task, sources]) => sources.map((source, index) => ({
  id: `new-${task}-${index + 1}`, task, source, origin: 'new_synthetic_witness',
  interpretation: 'A new implementation witness, not a new independent problem or a measured model run.'
})));

module.exports = { fresh };

'use strict';

module.exports = {
  "T1": {
    "source": "'use strict';\nfunction durationMinutes(start, end) {\n  const wall = value => Date.parse(value.slice(0, 19) + 'Z');\n  return (wall(end) - wall(start)) / 60000;\n}\nmodule.exports = { durationMinutes };\n",
    "visible": "'use strict';\nconst assert=require('node:assert/strict');\nconst {durationMinutes:f}=require('./module.cjs');\nfor(const [a,b,e] of [['2026-01-01T10:00:00Z','2026-01-01T11:30:00Z',90],['2026-01-01T23:00:00Z','2026-01-02T01:00:00Z',120],['2026-02-01T10:00:00Z','2026-02-01T09:00:00Z',-60]]) assert.equal(f(a,b),e);\nconsole.log(\"visible tests passed\");\n",
    "specification": "Corrige le bug et vérifie. Ce module Node calcule la durée réellement écoulée, en minutes, entre deux réservations ISO 8601 comprenant leur décalage UTC. Préserve les durées négatives et fractionnaires et exporte durationMinutes.\n"
  },
  "T2": {
    "source": "'use strict';\nfunction stableSort(records) {\n  return [...records].sort((a,b) => a.key > b.key ? 1 : -1);\n}\nmodule.exports = { stableSort };\n",
    "visible": "'use strict';\nconst assert=require('node:assert/strict');\nconst {stableSort:f}=require('./module.cjs');\nfor(const a of [[],[3,1,2],[9,-2,0,5]]) { const input=a.map((key,id)=>({key,id})); const before=JSON.stringify(input); assert.deepEqual(f(input).map(x=>x.key),[...a].sort((a,b)=>a-b)); assert.equal(JSON.stringify(input),before); }\nconsole.log(\"visible tests passed\");\n",
    "specification": "Corrige le bug et vérifie. Cette API Node renvoie une nouvelle liste triée par clé numérique croissante. Les enregistrements de même clé doivent conserver leur ordre d’entrée, sans mutation des objets ou de la liste fournie. Exporte stableSort.\n"
  },
  "T3": {
    "source": "'use strict';\nclass WriteCache {\n  constructor() { this.store=new Map(); this.pending=new Map(); this.cache=new Map(); this.lastKey=null; }\n  set(key,value) { this.pending.set(key,value); this.lastKey=key; this.cache.delete(key); }\n  flush() {\n    if(this.pending.size) this.store.set(this.lastKey,this.pending.get(this.lastKey));\n    this.pending.clear();\n  }\n  get(key) {\n    if(this.pending.has(key)) this.flush();\n    if(!this.cache.has(key)) this.cache.set(key,this.store.get(key));\n    return this.cache.get(key);\n  }\n}\nmodule.exports = { WriteCache };\n",
    "visible": "'use strict';\nconst assert=require('node:assert/strict');\nconst {WriteCache:C}=require('./module.cjs');\nconst c=new C(); for(const [k,v] of [['a',1],['b',2],['a',3]]) { c.set(k,v); assert.equal(c.get(k),v); } c.flush(); assert.equal(c.get('a'),3); assert.equal(c.get('missing'),undefined);\nconsole.log(\"visible tests passed\");\n",
    "specification": "Corrige le bug et vérifie. Cette API Node expose WriteCache avec set(key,value), get(key) et flush(). Les écritures sont différées jusqu’au flush. get doit toujours lire la dernière valeur écrite pour cette clé, y compris après des écritures sur d’autres clés. Les clés sont des chaînes et les valeurs JSON quelconques. Exporte WriteCache.\n"
  }
};

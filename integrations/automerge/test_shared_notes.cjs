'use strict';
const assert = require('node:assert/strict');
const Automerge = require('@automerge/automerge');
const notes = require('./sharedNotes.cjs');

const base = notes.empty();
const left = notes.add(Automerge.clone(base), 'a', { text: 'Erreur observée', source: 'worker-a' });
const right = notes.add(Automerge.clone(base), 'b', { text: 'Trafic réduit', source: 'worker-b' });
const merged = notes.merge(left, right);
assert.deepEqual(Object.keys(merged.observations).sort(), ['a', 'b']);
assert.deepEqual(Object.keys(notes.load(notes.save(merged)).observations).sort(), ['a', 'b']);
assert.throws(() => notes.merge(left, Automerge.from({ observations: {}, permissions: { admin: true } })));
assert.throws(() => notes.add(base, 'c', { text: 'x', source: 'w', promotion: true }));
console.log('Concurrent observations merge without merging authority or promotion.');

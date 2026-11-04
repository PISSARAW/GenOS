'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { tree } = require('./io.cjs');
const { witnessedTest } = require('./gate.cjs');
const instructions = `Tu corriges le bug décrit dans task.md. Tous les fichiers initiaux sont ci-dessous.
Réponds exclusivement par un objet JSON représentant UNE action :
{"tool":"read","path":"fichier.cjs"},
{"tool":"write","files":{"fichier.cjs":"contenu intégral"}},
{"tool":"test","path":"smoke.test.cjs|invariants.test.cjs|regression.test.cjs"},
{"tool":"finish","success":true|false,"message":"conclusion"}.
Tu peux lire et modifier les modules de production et créer regression.test.cjs.
Les tests fournis et task.md sont immuables. La clôture peut être refusée par
une porte de preuve ; ce refus consomme un appel. Toutes les variantes reçoivent
ce contrat : pour une clôture vérifiable, écris ET exécute regression.test.cjs,
couvrant les invariants de la spécification, et fais passer les tests fournis.
L'interface ne propose ni commande libre ni action réseau ; ses lectures sont
limitées au workspace.`;
function initial(workspace) {
  const contents = Object.fromEntries(Object.keys(tree(workspace)).map(name => [name, fs.readFileSync(path.join(workspace, name), 'utf8')]));
  return [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(contents) }];
}
function allowed(name, state) {
  return state.production.includes(name) || name === 'regression.test.cjs';
}
function apply(workspace, action, state) {
  if (!action || typeof action !== 'object') throw Error('INVALID_JSON_ACTION');
  if (action.tool === 'read') {
    if (!Object.hasOwn(tree(workspace), action.path)) throw Error('READ_OUTSIDE_WORKSPACE');
    return fs.readFileSync(path.join(workspace, action.path), 'utf8');
  }
  if (action.tool === 'test') {
    const test = witnessedTest(workspace, action.path);
    state.tests.push(test);
    return test;
  }
  if (action.tool === 'write') return edit(workspace, action.files, state);
  throw Error('UNKNOWN_ACTION');
}
function edit(workspace, entries, state) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('FILES_REQUIRED');
  for (const [name, content] of Object.entries(entries)) {
    if (!allowed(name, state) || typeof content !== 'string' || Buffer.byteLength(content) > 65536) throw Error('WRITE_FORBIDDEN');
  }
  for (const [name, content] of Object.entries(entries)) fs.writeFileSync(path.join(workspace, name), content);
  return { written: Object.keys(entries) };
}
module.exports = { initial, apply };

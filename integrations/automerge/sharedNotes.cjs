'use strict';
const Automerge = require('@automerge/automerge');

function validate(doc) {
  if (Object.keys(doc).some((key) => key !== 'observations')) throw new Error('protected state is not mergeable');
  if (!doc.observations || Array.isArray(doc.observations)) throw new Error('observations map required');
  for (const row of Object.values(doc.observations)) {
    if (!row || Object.keys(row).some((key) => !['text', 'source'].includes(key))) {
      throw new Error('invalid observation');
    }
    if (typeof row.text !== 'string' || typeof row.source !== 'string') throw new Error('invalid observation');
  }
  return doc;
}

function empty() {
  return Automerge.from({ observations: {} });
}

function add(doc, id, observation) {
  validate(doc);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('invalid observation id');
  const candidate = { observations: { [id]: observation } };
  validate(candidate);
  if (observation.text.length > 4000 || observation.source.length > 200) throw new Error('observation too large');
  return Automerge.change(doc, (draft) => { draft.observations[id] = observation; });
}

function merge(local, remote) {
  validate(local);
  validate(remote);
  return validate(Automerge.merge(local, remote));
}

function load(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1_000_000) throw new Error('invalid document size');
  return validate(Automerge.load(bytes));
}

module.exports = { empty, add, merge, load, save: Automerge.save };

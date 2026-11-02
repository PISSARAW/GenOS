'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./omegaProcessFixtures.cjs');
const same = (left, right) => digest(left) === digest(right);

function createHandlers(options) {
  return [
    { kind: 'READ', reference: 'source', pure: true, handle: ({ request }) => {
      if (request.objectId !== 'source.json') throw new Error('OMEGA reader object not installed.');
      options.count('read'); return JSON.parse(fs.readFileSync(path.join(options.directory, 'source.json'), 'utf8'));
    } },
    { kind: 'SELECT', reference: 'select-value', pure: true, handle: ({ input, request }) => {
      if (!same(request.fields, ['value'])) throw new Error('OMEGA selector fields not installed.');
      options.count('select'); return { value: input.value };
    } },
    { kind: 'CHECK', reference: 'is-seven', pure: true, handle: ({ candidate, request }) => {
      if (request.predicate !== 'value-is-seven') throw new Error('OMEGA verifier predicate not installed.');
      options.count('check'); return fixture.proof(candidate);
    } },
    { kind: 'EMIT', reference: 'publish-value' },
  ];
}

module.exports = { createHandlers };

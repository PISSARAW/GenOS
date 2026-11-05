'use strict';

const records = [{ key: 2, id: 'z' }, { key: 1, id: 'b' }, { key: 2, id: 'a' }, { key: 1, id: 'z2' }];
const sorted = [records[1], records[3], records[0], records[2]];
const cases = {
  T1: [
    ['offset-spring', ['2024-03-31T01:05:00+01:00', '2024-03-31T03:35:00+02:00'], 90],
    ['offset-autumn', ['2024-10-27T02:20:00+02:00', '2024-10-27T02:50:00+01:00'], 90],
    ['same-instant', ['2024-06-01T12:00:00+05:30', '2024-06-01T06:30:00Z'], 0],
    ['fraction', ['2024-01-01T00:00:00.125Z', '2024-01-01T00:00:00.875Z'], 0.0125],
    ['negative-fraction', ['2024-01-01T00:00:00.875Z', '2024-01-01T00:00:00.125Z'], -0.0125]
  ].map(([id, args, expected]) => ({ id, steps: [{ op: 'call', name: 'durationMinutes', args, expected }] })),
  T2: [
    { id: 'stable-duplicate-keys', steps: [{ op: 'call', name: 'stableSort', args: [records], expected: sorted }] },
    { id: 'metadata-is-not-a-tie-breaker', steps: [{ op: 'call', name: 'stableSort',
      args: [[{ key: 1, id: 9 }, { key: 1, id: 2 }, { key: 0, id: 5 }, { key: 1, id: 7 }]],
      expected: [{ key: 0, id: 5 }, { key: 1, id: 9 }, { key: 1, id: 2 }, { key: 1, id: 7 }] }] },
    { id: 'empty-copy', steps: [{ op: 'call', name: 'stableSort', args: [[]], expected: [] }] },
    { id: 'negative-fractional-keys', steps: [{ op: 'call', name: 'stableSort',
      args: [[{ key: -0.5, id: 'left' }, { key: -0.5, id: 'right' }, { key: -2, id: 'first' }]],
      expected: [{ key: -2, id: 'first' }, { key: -0.5, id: 'left' }, { key: -0.5, id: 'right' }] }] }
  ],
  T3: [{ id: 'interleaved-json-writes', steps: [
    { op: 'construct', name: 'WriteCache', as: 'cache', args: [] },
    { op: 'method', target: 'cache', name: 'set', args: ['alpha', { version: 1 }] },
    { op: 'method', target: 'cache', name: 'set', args: ['beta', null] },
    { op: 'method', target: 'cache', name: 'flush', args: [] },
    { op: 'method', target: 'cache', name: 'get', args: ['alpha'], expected: { version: 1 } },
    { op: 'method', target: 'cache', name: 'get', args: ['beta'], expected: null },
    { op: 'method', target: 'cache', name: 'set', args: ['alpha', { version: 2 }] },
    { op: 'method', target: 'cache', name: 'set', args: ['gamma', false] },
    { op: 'method', target: 'cache', name: 'get', args: ['alpha'], expected: { version: 2 } },
    { op: 'method', target: 'cache', name: 'get', args: ['gamma'], expected: false },
    { op: 'method', target: 'cache', name: 'set', args: ['__proto__', [1, 2]] },
    { op: 'method', target: 'cache', name: 'set', args: ['other', 0] },
    { op: 'method', target: 'cache', name: 'flush', args: [] },
    { op: 'method', target: 'cache', name: 'get', args: ['__proto__'], expected: [1, 2] },
    { op: 'method', target: 'cache', name: 'get', args: ['other'], expected: 0 },
    { op: 'method', target: 'cache', name: 'set', args: ['alpha', 'last'] },
    { op: 'method', target: 'cache', name: 'flush', args: [] },
    { op: 'method', target: 'cache', name: 'get', args: ['alpha'], expected: 'last' },
    { op: 'method', target: 'cache', name: 'get', args: ['missing'], expectedUndefined: true }
  ] }]
};

function encode(value) { return JSON.stringify({ schema: 'genos.boundary-cases/v1', cases: value }, null, 2) + '\n'; }
function boundaryCheck(task) {
  if (!Object.hasOwn(cases, task)) throw Error('Unknown finite acceptance profile');
  return encode(cases[task]);
}
function nonDiscriminatingCheck(task) {
  const visible = {
    T1: [{ id: 'visible-utc', steps: [{ op: 'call', name: 'durationMinutes',
      args: ['2026-01-01T10:00:00Z', '2026-01-01T11:30:00Z'], expected: 90 }] }],
    T2: [{ id: 'visible-unique-keys', steps: [{ op: 'call', name: 'stableSort',
      args: [[{ key: 2 }, { key: 1 }]], expected: [{ key: 1 }, { key: 2 }] }] }],
    T3: [{ id: 'visible-immediate-read', steps: [
      { op: 'construct', name: 'WriteCache', as: 'cache', args: [] },
      { op: 'method', target: 'cache', name: 'set', args: ['a', 1] },
      { op: 'method', target: 'cache', name: 'get', args: ['a'], expected: 1 }
    ] }]
  };
  return encode(visible[task]);
}

module.exports = { boundaryCheck, nonDiscriminatingCheck };

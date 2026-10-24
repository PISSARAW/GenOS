'use strict';

const assert = require('node:assert/strict');
const { intersectAuthority } = require('../src/services/capabilityInheritance/resolver/authorityIntersection');

assert.deepEqual(intersectAuthority(['plan:read', 'tasks:write'], ['plan:read']), { allowed: ['plan:read'], denied: ['tasks:write'], authorized: false });
assert.deepEqual(intersectAuthority(['plan:read'], ['plan:read', 'other:write']), { allowed: ['plan:read'], denied: [], authorized: true });
assert.deepEqual(intersectAuthority(['admin:delete'], ['admin:*']), { allowed: [], denied: ['admin:delete'], authorized: false });
console.log('GCI authority intersection: ok');

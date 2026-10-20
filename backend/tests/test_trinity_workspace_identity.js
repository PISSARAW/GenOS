'use strict';

const assert = require('node:assert/strict');
const identity = require('../src/services/trinityWorkspaceIdentity');

function windowsCases() {
  const options = { platform: 'win32', realpath: (root) => root };
  const sealed = { workspaceId: 'trinity_workspace_worker', workspaceRoot: 'C:\\GenOS\\Capsule' };
  const equivalent = { workspaceId: sealed.workspaceId, workspaceRoot: 'c:/genos/capsule/' };
  assert.equal(identity.sameWorkspaceIdentity(sealed, equivalent, options), true);
  assert.equal(identity.sameWorkspaceRoot(sealed.workspaceRoot, equivalent.workspaceRoot, options), true);
  assert.equal(identity.sameWorkspaceIdentity(sealed,
    { ...equivalent, workspaceId: 'trinity_workspace_other' }, options), false);
  assert.equal(identity.sameWorkspaceRoot(sealed.workspaceRoot, 'C:\\GenOS\\Other', options), false);
}

function invalidCases() {
  assert.equal(identity.canonicalWorkspaceRoot('relative/workspace'), null);
  assert.equal(identity.sameWorkspaceRoot('', process.cwd()), false);
  assert.equal(identity.sameWorkspaceIdentity({ workspaceId: 'workspace', workspaceRoot: process.cwd() },
    { workspaceId: null, workspaceRoot: process.cwd() }), false);
}

windowsCases();
invalidCases();
console.log('Trinity canonical workspace identity handles Windows spelling and real scope drift: PASS');

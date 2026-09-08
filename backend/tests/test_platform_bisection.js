const assert = require('node:assert/strict');
const platform = require('../src/controllers/platformController');
const workspace = require('../src/controllers/workspaceController');

const original = workspace.bisect;
let delegated = false;
workspace.bisect = async (req, res, next) => {
  delegated = req.body.workspaceId === 'workspace-1' && req.tenant.organizationId === 'org-1';
  res.status(200).json({ bisectionComplete: true });
};

(async () => {
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await platform.bisect({ body: { workspaceId: 'workspace-1' }, tenant: { organizationId: 'org-1', projectId: 'project-1' } }, res, () => {});
  assert.equal(delegated, true);
  assert.equal(res.body.bisectionComplete, true);
  workspace.bisect = original;
  console.log('Platform bisection delegates to the durable workspace runner.');
})().catch((error) => { workspace.bisect = original; console.error(error); process.exitCode = 1; });
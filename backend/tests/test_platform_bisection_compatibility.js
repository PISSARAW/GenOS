const assert = require('node:assert/strict');
const platform = require('../src/controllers/platformController');
const workspace = require('../src/controllers/workspaceController');

const original = workspace.bisect;
let delegated = false;
workspace.bisect = async (req, res, next) => { delegated = req.body.workspaceId === 'ws-1'; res.status(200).json({ compatible: true }); };
const response = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(value) { this.value = value; } };
platform.bisect({ body: { workspaceId: 'ws-1' } }, response, (error) => { throw error; })
  .then(() => {
    assert.equal(delegated, true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.value.compatible, true);
    console.log('Platform bisection compatibility checks passed.');
  })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { workspace.bisect = original; });
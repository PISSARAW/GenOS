'use strict';

const assert = require('assert');
const fixture = require('./ontogenesisFixture');
const { compileDevelopmentalContext, gvxScope } = require('../src/services/ontogenesis/developmentalContextService');

async function main() {
  const db = await fixture.memoryDb();
  try {
    const project = { id: 'project-context', config_json: '{}' };
    const context = await compileDevelopmentalContext(db, project);
    assert.strictEqual(context.shev.available, false);
    assert.strictEqual(context.gvx.available, false);
    assert.strictEqual(context.gvx.reason, 'scope-explicite-requis');
    assert.strictEqual(context.failClosed, true);
    assert.strictEqual(gvxScope({}, project.id), null);
    const scoped = await compileDevelopmentalContext(db, {
      id: project.id,
      config_json: JSON.stringify({ gvxScope: { organizationId: 'org-1', entityId: 'site-1' } })
    });
    assert.strictEqual(scoped.gvx.available, true);
    assert.strictEqual(scoped.gvx.eventCount, 0);
    assert.strictEqual(scoped.failClosed, false);
    console.log('ontogenesis developmental context checks passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

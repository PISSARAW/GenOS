const assert = require('node:assert/strict');
const path = require('node:path');
const { createExclusionFilter, copyTree } = require('../src/services/agentWorkspaceLifecycle/copy');

async function run() {
	const isExcluded = createExclusionFilter();
	assert.equal(isExcluded('.env'), true);
	assert.equal(isExcluded('id_rsa'), true);
	assert.equal(isExcluded('genos.db-wal'), true);
	assert.equal(isExcluded('genos.db.backup-20260916-075110'), true);
	assert.equal(isExcluded('README.md'), false);

	const missing = path.resolve(__dirname, 'missing-during-workspace-copy');
	await assert.doesNotReject(() => copyTree(
		{ isExcluded, state: { entries: 0, bytes: 0 } },
		{ source: missing, destination: `${missing}-destination`, relative: 'missing.txt' }
	));
	console.log('Workspace sensitive-file exclusion checks passed.');
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
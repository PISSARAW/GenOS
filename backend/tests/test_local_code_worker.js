const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { parseProposal, safePath, executeProposal } = require('../src/services/localCodeWorkerService');
const { isAllowedSandboxTestCommand } = require('../src/services/sandboxCommandPolicy');
assert.equal(safePath('src/lib.rs'), true);
assert.equal(safePath('tests/security.rs'), false);
assert.equal(safePath('src/lib.test.js'), false);
assert.equal(safePath('Cargo.toml'), false);
assert.throws(() => parseProposal('{"format":"genos.file-replacement/v1","patches":[{"path":"tests/x.rs","content":"x"}],"tests":["cargo test --quiet"],"evidence":"x"}'));
const proposal = parseProposal('{"format":"genos.file-replacement/v1","patches":[{"path":"src/lib.rs","content":"pub fn x() {}"}],"tests":["cargo test --quiet"],"evidence":"unit test"}');
assert.equal(proposal.patches[0].path, 'src/lib.rs');
assert.equal(isAllowedSandboxTestCommand('cargo  test --quiet'), true);
assert.equal(isAllowedSandboxTestCommand('pytest'), true);
assert.equal(isAllowedSandboxTestCommand('cargo test; whoami'), false);
assert.equal(isAllowedSandboxTestCommand('cargo test --manifest-path ../outside/Cargo.toml'), false);
assert.equal(isAllowedSandboxTestCommand('cargo test --config ../outside/config.toml'), false);
assert.equal(isAllowedSandboxTestCommand(`npm test -- ${'a'.repeat(513)}`), false);

(async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-local-worker-test-'));
	try {
		await assert.rejects(
			executeProposal({ workspaceRoot: root, text: JSON.stringify({ ...proposal, tests: ['node malicious.js'] }) }),
			/not allow-listed/
		);
		await assert.rejects(fs.access(path.join(root, 'src', 'lib.rs')));
		await fs.mkdir(path.join(root, 'linked-target'));
		await fs.symlink(path.join(root, 'linked-target'), path.join(root, 'linked'), 'junction');
		await assert.rejects(
			executeProposal({ workspaceRoot: root, text: JSON.stringify({ ...proposal, patches: [{ path: 'linked/escape.rs', content: 'x' }] }) }),
			/symlink/
		);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
	console.log('Local code worker safety checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

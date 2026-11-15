'use strict';

async function applyProposalEdits(context) {
try {
    for (const patch of context.proposal.patches) {
      const destination = context.path.resolve(context.workspaceRoot, context.normalizeRelativePath(patch.path, 'patch path'));
      if (!destination.startsWith(`${context.path.resolve(context.workspaceRoot)}${context.path.sep}`)) throw new context.Error('Patch escaped its isolated capsule.');
      await context.assertNoSymlinkPath(context.workspaceRoot, destination);
      await context.fs.mkdir(context.path.dirname(destination), { recursive: true });
      await context.assertNoSymlinkPath(context.workspaceRoot, destination);
      await context.fs.writeFile(destination, patch.content, 'utf8');
    }
    await context.observeCandidate();
    context.tests = [];
    for (const command of context.proposal.tests) context.tests.push(await context.runTest(command, context.workspaceRoot));
  } catch (error) {
    await context.restorePatchState(context.workspaceRoot, context.patchState).catch(() => {});
    throw error;
  }
}

module.exports = { applyProposalEdits };

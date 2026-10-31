'use strict';

async function executeProposalStage1(__genosStageScope1) {
try {
    for (const patch of __genosStageScope1.proposal.patches) {
      const destination = __genosStageScope1.path.resolve(__genosStageScope1.workspaceRoot, (0, __genosStageScope1.normalizeRelativePath)(patch.path, 'patch path'));
      if (!destination.startsWith(`${__genosStageScope1.path.resolve(__genosStageScope1.workspaceRoot)}${__genosStageScope1.path.sep}`)) throw new __genosStageScope1.Error('Patch escaped its isolated capsule.');
      await (0, __genosStageScope1.assertNoSymlinkPath)(__genosStageScope1.workspaceRoot, destination);
      await __genosStageScope1.fs.mkdir(__genosStageScope1.path.dirname(destination), { recursive: true });
      await (0, __genosStageScope1.assertNoSymlinkPath)(__genosStageScope1.workspaceRoot, destination);
      await __genosStageScope1.fs.writeFile(destination, patch.content, 'utf8');
    }
    __genosStageScope1.tests = [];
    for (const command of __genosStageScope1.proposal.tests) __genosStageScope1.tests.push(await (0, __genosStageScope1.runTest)(command, __genosStageScope1.workspaceRoot));
  } catch (error) {
    await (0, __genosStageScope1.restorePatchState)(__genosStageScope1.workspaceRoot, __genosStageScope1.patchState).catch(() => {});
    throw error;
  }
}

module.exports = { executeProposalStage1 };

'use strict';

function assertProposalPatchesValue1(__genosValueScope1) {
  return __genosValueScope1.edit && __genosValueScope1.Object.keys(__genosValueScope1.edit).every((key) => ['find', 'replace'].includes(key))
        && typeof __genosValueScope1.edit.find === 'string' && __genosValueScope1.edit.find.length > 0 && __genosValueScope1.Buffer.byteLength(__genosValueScope1.edit.find) <= 10000
        && typeof __genosValueScope1.edit.replace === 'string' && __genosValueScope1.Buffer.byteLength(__genosValueScope1.edit.replace) <= 10000;
}

function assertProposalPatchesValue2(__genosValueScope2) {
  return __genosValueScope2.options.forceFullFileReplacement && (!__genosValueScope2.Object.hasOwn(__genosValueScope2.patch || {}, 'content') || __genosValueScope2.Object.hasOwn(__genosValueScope2.patch || {}, 'edits'));
}

function executeProposalValue3(__genosValueScope3) {
  return __genosValueScope3.db && __genosValueScope3.mission && __genosValueScope3.executionRun?.id;
}

function assertProposalPatchesValue4(__genosValueScope4) {
  return __genosValueScope4.Array.isArray(__genosValueScope4.patch.edits) && !__genosValueScope4.Object.hasOwn(__genosValueScope4.patch, 'content')
      && __genosValueScope4.patch.edits.length > 0 && __genosValueScope4.patch.edits.length <= 8
      && __genosValueScope4.patch.edits.every((edit) => (0, __genosValueScope4.require)('./localCodeWorkerServiceValues1.js').assertProposalPatchesValue1({ Buffer: __genosValueScope4.Buffer, Object: __genosValueScope4.Object, edit }));
}

function executeProposalValue5(__genosValueScope5) {
  return __genosValueScope5.mission.missionId || __genosValueScope5.mission.mission_id || __genosValueScope5.mission.id;
}

function proposalResponseFormatValue6(__genosValueScope6) {
  return !__genosValueScope6.commands.length && !__genosValueScope6.paths.length && !__genosValueScope6.allowedPaths.length && !__genosValueScope6.resolved.forceFullFileReplacement;
}

function assertProposalSchemaValue7(__genosValueScope7) {
  return !__genosValueScope7.proposal || __genosValueScope7.Object.keys(__genosValueScope7.proposal).some((key) => !['format', 'patches', 'tests', 'evidence'].includes(key)) || !__genosValueScope7.allowedFormats.includes(__genosValueScope7.proposal.format) || !__genosValueScope7.Array.isArray(__genosValueScope7.proposal.patches) || !__genosValueScope7.Array.isArray(__genosValueScope7.proposal.tests) || typeof __genosValueScope7.proposal.evidence !== 'string';
}

function assertProposalPatchesValue8(__genosValueScope8) {
  return (!__genosValueScope8.hasContent && !__genosValueScope8.hasEdits) || (__genosValueScope8.hasContent && __genosValueScope8.Buffer.byteLength(__genosValueScope8.patch.content) > 200000);
}

module.exports = { assertProposalPatchesValue1, assertProposalPatchesValue2, executeProposalValue3, assertProposalPatchesValue4, executeProposalValue5, proposalResponseFormatValue6, assertProposalSchemaValue7, assertProposalPatchesValue8 };

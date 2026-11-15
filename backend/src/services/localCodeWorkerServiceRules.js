'use strict';

function assertProposalPatchesRule1(context) {
  return context.edit && context.Object.keys(context.edit).every((key) => ['find', 'replace'].includes(key))
        && typeof context.edit.find === 'string' && context.edit.find.length > 0 && context.Buffer.byteLength(context.edit.find) <= 10000
        && typeof context.edit.replace === 'string' && context.Buffer.byteLength(context.edit.replace) <= 10000;
}

function assertProposalPatchesRule2(context) {
  return context.options.forceFullFileReplacement && (!context.Object.hasOwn(context.patch || {}, 'content') || context.Object.hasOwn(context.patch || {}, 'edits'));
}

function executeProposalRule3(context) {
  return context.db && context.mission && context.executionRun?.id;
}

function assertProposalPatchesRule4(context) {
  return context.Array.isArray(context.patch.edits) && !context.Object.hasOwn(context.patch, 'content')
      && context.patch.edits.length > 0 && context.patch.edits.length <= 8
      && context.patch.edits.every((edit) => context.require('./localCodeWorkerServiceRules.js').assertProposalPatchesRule1({ Buffer: context.Buffer, Object: context.Object, edit }));
}

function executeProposalRule5(context) {
  return context.mission.missionId || context.mission.mission_id || context.mission.id;
}

function proposalResponseFormat(context) {
  return !context.commands.length && !context.paths.length && !context.allowedPaths.length && !context.resolved.forceFullFileReplacement;
}

function assertProposalSchema(context) {
  return !context.proposal || context.Object.keys(context.proposal).some((key) => !['format', 'patches', 'tests', 'evidence'].includes(key)) || !context.allowedFormats.includes(context.proposal.format) || !context.Array.isArray(context.proposal.patches) || !context.Array.isArray(context.proposal.tests) || typeof context.proposal.evidence !== 'string';
}

function assertProposalPatchesRule8(context) {
  return (!context.hasContent && !context.hasEdits) || (context.hasContent && context.Buffer.byteLength(context.patch.content) > 200000);
}

module.exports = { assertProposalPatchesRule1, assertProposalPatchesRule2, executeProposalRule3, assertProposalPatchesRule4, executeProposalRule5, proposalResponseFormat, assertProposalSchema, assertProposalPatchesRule8 };

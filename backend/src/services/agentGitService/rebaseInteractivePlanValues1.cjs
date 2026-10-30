'use strict';

function validateActionsValue1(__genosValueScope1) {
  return __genosValueScope1.actions.forEach((item, index) => {
    if (!__genosValueScope1.ACTIONS.has(item?.action)) throw new __genosValueScope1.Error(`Unsupported action at ${index}.`);
    if (['squash', 'fixup'].includes(item.action) && index === 0) throw new __genosValueScope1.Error('First action cannot squash or fixup.');
    if (item.action === 'edit' && (!item.state || typeof item.state !== 'object')) {
      throw new __genosValueScope1.Error(`Edit action ${index} requires a state.`);
    }
  });
}

function planReplayValue2(__genosValueScope2) {
  return __genosValueScope2.action.message || __genosValueScope2.JSON.parse(__genosValueScope2.commit.metadata_json || '{}').message || __genosValueScope2.commit.id;
}

module.exports = { validateActionsValue1, planReplayValue2 };

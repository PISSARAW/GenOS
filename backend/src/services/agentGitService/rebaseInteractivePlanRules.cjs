'use strict';

function validateActions(context) {
  return context.actions.forEach((item, index) => {
    if (!context.ACTIONS.has(item?.action)) throw new context.Error(`Unsupported action at ${index}.`);
    if (['squash', 'fixup'].includes(item.action) && index === 0) throw new context.Error('First action cannot squash or fixup.');
    if (item.action === 'edit' && (!item.state || typeof item.state !== 'object')) {
      throw new context.Error(`Edit action ${index} requires a state.`);
    }
  });
}

function planReplay(context) {
  return context.action.message || context.JSON.parse(context.commit.metadata_json || '{}').message || context.commit.id;
}

module.exports = { validateActions, planReplay };

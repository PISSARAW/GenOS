'use strict';

async function controlledRunner(arm, state, control) {
  state.step = Number.isInteger(state.step) ? state.step : 0;
  state.value = Number.isFinite(state.value) ? state.value : 0;
  if (!control.resume) {
    await advance(arm, state, control);
    if (arm.pauseAfterCheckpoint) {
      process.stdout.write('CHECKPOINT_READY\n');
      await new Promise((resolve) => setTimeout(resolve, 120000));
    }
  }
  while (state.step < control.budget) await advance(arm, state, control);
  return { metric: state.value, trajectory: [{ step: state.step, value: state.value }] };
}

async function advance(arm, state, control) {
  state.step += 1;
  state.value += arm.delta;
  await control.checkpoint(state);
}

module.exports = controlledRunner;

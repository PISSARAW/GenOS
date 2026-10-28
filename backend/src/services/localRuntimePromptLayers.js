'use strict';

function rebuild(state) {
  const layers = [state.baseFramedPrompt, state.observationPromptBlock,
    state.intraEpochPromptBlock].filter(Boolean);
  state.framedPrompt = `${layers.join('\n\n')}\n`;
  state.promptTokenEstimate = Math.ceil(Buffer.byteLength(state.framedPrompt, 'utf8') / 4);
  if (state.mission) {
    require('./agentRuntimeAdapter/missionPromptBudget')
      .assertMissionPromptBudget(state.mission, state.framedPrompt);
  }
  return state.framedPrompt;
}

module.exports = { rebuild };

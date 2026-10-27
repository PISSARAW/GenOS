'use strict';

const { proxyActivities, workflowInfo } = require('@temporalio/workflow');

const { completeTask } = proxyActivities({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '10 milliseconds', maximumInterval: '50 milliseconds', maximumAttempts: 2 }
});

async function replayWorkflow(input) {
  let firstReplay;
  let finalReplay;
  let allReplaysMatch = true;
  for (let attempt = 0; attempt < input.replay_count; attempt += 1) {
    const state = {};
    const effects = [];
    for (const event of input.events) {
      if (event.op === 'set') state[event.key] = event.value;
      if (event.op === 'add') state[event.key] = (state[event.key] || 0) + event.value;
      effects.push(`${event.op}:${event.value}`);
    }
    const replay = { state, observable_effects: effects };
    if (!firstReplay) firstReplay = replay;
    else allReplaysMatch &&= JSON.stringify(replay) === JSON.stringify(firstReplay);
    finalReplay = replay;
  }
  return { ...finalReplay, replay_count: input.replay_count, all_replays_match: allReplaysMatch };
}

async function resilienceWorkflow(input) {
  const scope = workflowInfo().workflowId;
  for (let index = 0; index < input.tasks.length; index += 1) {
    await completeTask({ scope, taskId: input.tasks[index],
      failOnce: index === input.crash_after_task_index,
      effectKey: index === input.crash_after_task_index ? input.effect_key : null });
  }
  return { completed_tasks: input.tasks, irreversible_effect_count: input.effect_key ? 1 : 0 };
}

async function communicationWorkflow(input) {
  const scope = workflowInfo().workflowId;
  const responses = await Promise.all(input.tasks.map((task) => completeTask({
    scope, taskId: task.id, failOnce: false, effectKey: null
  })));
  return { delivered_task_ids: responses.map((item) => item.taskId), unresolved_dependencies: [] };
}

async function omegaWorkflow(experiment, input) {
  if (experiment === 'E05') return replayWorkflow(input);
  if (experiment === 'E06') return resilienceWorkflow(input);
  if (experiment === 'E07') return communicationWorkflow(input);
  throw new Error(`Temporal baseline does not implement ${experiment}.`);
}

exports.omegaWorkflow = omegaWorkflow;

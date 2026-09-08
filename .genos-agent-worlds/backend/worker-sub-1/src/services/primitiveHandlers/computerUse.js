/**
 * Computer Use primitives — expose the desktop-control loop as strategy
 * primitives (`capture`, `run_plan`) so `computer_use_direct` can be invoked
 * by the orchestrator/agents through strategyExecutionAdapter, exactly like
 * any other strategy (fork, snapshot, causal_replay, ...).
 */
const { runMission, captureScreenshot } = require('../computerUseService');

async function capture(context = {}) {
  try {
    const base64Png = await captureScreenshot();
    return { success: true, sizeBytes: Buffer.byteLength(base64Png, 'utf8'), format: 'png_base64' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runPlan(context = {}) {
  const mission = context.mission || context.task || context.detail || context.goal;
  if (!mission) return { success: false, error: "run_plan requires a 'mission' describing the desktop task." };
  try {
    const result = await runMission(String(mission), {
      model: context.model,
      maxIterations: context.maxIterations || context.max_iterations,
      onLog: () => {} // strategy execution is non-interactive; history is returned in the result
    });
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { capture, runPlan };

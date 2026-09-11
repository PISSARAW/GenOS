const { quoteCliArg } = require('../shellQuote');

function handleAllostaticPlanning(args, run) {
  let cmdParams = [];
  if (args.action === 'predict') {
    cmdParams.push('--param action=predict', `--param plan_action=${quoteCliArg(args.plan_action)}`, `--param expected=${quoteCliArg(args.expected)}`, `--param cost=${quoteCliArg(args.cost)}`);
  } else {
    cmdParams.push('--param action=evaluate', `--param score=${quoteCliArg(args.score)}`);
  }
  const cmd = `genos biomimicry bio-feature --feature allostatic --action plan ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleAllostaticPlanningError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleAllostaticPlanning, handleAllostaticPlanningError };

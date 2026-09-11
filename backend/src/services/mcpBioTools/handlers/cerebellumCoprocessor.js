const { quoteCliArg } = require('../shellQuote');

function handleCerebellumCoprocessor(args, run) {
  const out = run(`genos biomimicry cerebellum-coprocessor --agent-id ${quoteCliArg(args.agent_id)} --target-value ${quoteCliArg(args.target_value)} --expected-latency ${quoteCliArg(args.expected_latency)} --current-value ${quoteCliArg(args.current_value)} --actual-latency ${quoteCliArg(args.actual_latency)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCerebellumCoprocessorError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCerebellumCoprocessor, handleCerebellumCoprocessorError };

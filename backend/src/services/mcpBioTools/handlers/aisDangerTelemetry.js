const { quoteCliArg } = require('../shellQuote');

function handleAISDangerTelemetry(args, run) {
  const out = run(`genos ais danger-telemetry --agent-id ${quoteCliArg(args.agent_id)} --severity ${quoteCliArg(args.severity)} --threat-context ${quoteCliArg(args.threat_context)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleAISDangerTelemetryError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleAISDangerTelemetry, handleAISDangerTelemetryError };

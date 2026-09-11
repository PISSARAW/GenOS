const { quoteCliArg } = require('../shellQuote');

function handleAISPRRScan(args, run) {
  const patterns = args.patterns_detected ? args.patterns_detected.join(',') : '';
  const out = run(`genos ais prr-scan --agent-id ${quoteCliArg(args.agent_id)} --patterns ${quoteCliArg(patterns)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleAISPRRScanError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleAISPRRScan, handleAISPRRScanError };

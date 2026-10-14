function rejectLease(message) {
  process.stderr.write(`Invalid mission tool lease: ${message}\n`);
  process.exitCode = 2;
  return null;
}

function parseToolLease(rawJson) {
  let toolLease = [];
  if (rawJson != null && String(rawJson).trim()) {
    try { toolLease = JSON.parse(rawJson); }
    catch (_) { return rejectLease('expected valid JSON.'); }
  }
  if (!Array.isArray(toolLease) || toolLease.some((tool) => typeof tool !== 'string' || !tool.trim())) {
    return rejectLease('expected an array of non-empty tool names.');
  }
  return [...new Set(toolLease.map((tool) => tool.trim()))];
}

module.exports = { parseToolLease };

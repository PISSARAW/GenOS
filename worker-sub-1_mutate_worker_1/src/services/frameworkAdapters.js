const SUPPORTED = new Set(['langgraph', 'crewai', 'autogen', 'langfuse', 'phoenix']);
function normalize(source, payload = {}) {
  const framework = String(source || payload.framework || '').toLowerCase(); if (!SUPPORTED.has(framework)) throw new Error(`Unsupported framework: ${framework}`);
  const attributes = payload.attributes || payload.metadata || payload.extra || {};
  return { framework, traceId: payload.trace_id || payload.traceId || payload.run_id || payload.runId || `external-${Date.now()}`, spanId: payload.span_id || payload.spanId || payload.id, parentSpanId: payload.parent_span_id || payload.parentSpanId || null, name: payload.name || payload.event || payload.type || `${framework}.event`, agentId: payload.agent_id || payload.agentId || payload.actor || framework, startTime: Number(payload.start_time || payload.startTime || Date.now()), endTime: payload.end_time || payload.endTime ? Number(payload.end_time || payload.endTime) : null, inputs: payload.inputs || payload.input || attributes.input || {}, outputs: payload.outputs || payload.output || attributes.output || {}, error: payload.error || null, attributes };
}
module.exports = { normalize, SUPPORTED };

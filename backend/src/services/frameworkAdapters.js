const SUPPORTED = new Set(['langgraph', 'crewai', 'autogen', 'langfuse', 'phoenix']);

function pick(values, fallback) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index]) return values[index];
  }
  return fallback;
}

function resolveFramework(source, payload) {
  const framework = String(pick([source, payload.framework], '')).toLowerCase();
  if (!SUPPORTED.has(framework)) throw new Error(`Unsupported framework: ${framework}`);
  return framework;
}

function resolveTiming(payload) {
  const startTime = Number(pick([payload.start_time, payload.startTime], Date.now()));
  const endValue = pick([payload.end_time, payload.endTime], null);
  return { startTime, endTime: endValue ? Number(endValue) : null };
}

function normalize(source, payload = {}) {
  const framework = resolveFramework(source, payload);
  const attributes = pick([payload.attributes, payload.metadata, payload.extra], {});
  const timing = resolveTiming(payload);
  return { framework, traceId: pick([payload.trace_id, payload.traceId, payload.run_id, payload.runId], `external-${Date.now()}`), spanId: pick([payload.span_id, payload.spanId], payload.id), parentSpanId: pick([payload.parent_span_id, payload.parentSpanId], null), name: pick([payload.name, payload.event, payload.type], `${framework}.event`), agentId: pick([payload.agent_id, payload.agentId, payload.actor], framework), startTime: timing.startTime, endTime: timing.endTime, inputs: pick([payload.inputs, payload.input, attributes.input], {}), outputs: pick([payload.outputs, payload.output, attributes.output], {}), error: pick([payload.error], null), attributes };
}

module.exports = { normalize, SUPPORTED };

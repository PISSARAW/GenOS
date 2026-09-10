const crypto = require('crypto');
const frameworkAdapters = require('../services/frameworkAdapters');
const { getDatabase } = require('../db');
const { boundedInteger } = require('./argumentBounds');
const { scopeSql } = require('../middleware/tenant');
const parse = (v, fallback) => { try { return JSON.parse(v); } catch (_) { return fallback; } };
const map = (span) => span && ({ ...span, inputs: parse(span.inputs_json, {}), outputs: parse(span.outputs_json, {}) });
function buildTraceReplay(traceId, spans) {
	const ordered = spans
		.map(map)
		.sort((a, b) => Number(a.start_time || 0) - Number(b.start_time || 0) || String(a.id).localeCompare(String(b.id)));
	const canonical = JSON.stringify(ordered.map((span) => ({
		id: span.id,
		parent_span_id: span.parent_span_id || null,
		name: span.name,
		start_time: span.start_time,
		end_time: span.end_time,
		inputs: span.inputs,
		outputs: span.outputs,
		error: span.error || null
	})));
	const replayHash = crypto.createHash('sha256').update(canonical).digest('hex');
	return {
		success: true,
		traceId,
		replayId: `trace-replay-${traceId}-${replayHash.slice(0, 16)}`,
		replayStatus: 'RECONSTRUCTED',
		replayMode: 'trace-reconstruction',
		replayVerified: false,
		qualityGuarantee: false,
		requiresReexecution: true,
		replayHash,
		spanCount: ordered.length,
		spans: ordered,
		errors: ordered.filter((span) => span.error).length
	};
}

async function listTraces(req, res, next) { try { const db = await getDatabase(); const limit = boundedInteger(req.query.limit, 50, 1, 200); const scope = scopeSql(req, 't'); const rows = await db.all(`SELECT t.trace_id, COUNT(*) AS span_count, MIN(t.start_time) AS start_time, MAX(COALESCE(t.end_time, t.start_time)) AS end_time, SUM(CASE WHEN t.error IS NOT NULL THEN 1 ELSE 0 END) AS error_count FROM trace_spans t WHERE ${scope.clause} GROUP BY t.trace_id ORDER BY start_time DESC LIMIT ?`, ...scope.params, limit); res.json(rows.map((r) => ({ ...r, duration_ms: Math.max(0, r.end_time - r.start_time) }))); } catch (e) { next(e); } }
async function getTrace(req, res, next) { try { const db = await getDatabase(); const scope = scopeSql(req); const spans = await db.all(`SELECT * FROM trace_spans WHERE trace_id = ? AND ${scope.clause} ORDER BY start_time ASC`, req.params.traceId, ...scope.params); if (!spans.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Trace not found.' } }); res.json({ traceId: req.params.traceId, spans: spans.map(map) }); } catch (e) { next(e); } }
async function ingestSpan(req, res, next) { try {
	const db = await getDatabase();
	const scope = scopeSql(req);
	const raw = req.body || {};
	const body = raw.framework ? frameworkAdapters.normalize(raw.framework, raw) : raw;
	const id = body.spanId || body.id || `span-${crypto.randomUUID()}`;
	const traceId = body.traceId || body.trace_id || `trace-${crypto.randomUUID()}`;
	const agentId = body.agentId || body.agent_id || 'unknown';
	const parentSpanId = body.parentSpanId || body.parent_span_id || null;
	const name = body.name || 'span';
	const startValue = body.startTime ?? body.start_time ?? Date.now();
	const endValue = body.endTime ?? body.end_time;
	const startTime = Number(startValue);
	const endTime = endValue === undefined || endValue === null ? null : Number(endValue);
	if ([['id', id], ['traceId', traceId], ['agentId', agentId], ['name', name]].some(([field, value]) => typeof value !== 'string' || !value.trim() || value.length > 512)) {
		return res.status(400).json({ error: { code: 'INVALID_SPAN_FIELDS', message: 'Span identifiers and name must be non-empty strings no longer than 512 characters.' } });
	}
	if (parentSpanId !== null && (typeof parentSpanId !== 'string' || parentSpanId.length > 512)) return res.status(400).json({ error: { code: 'INVALID_PARENT_SPAN', message: 'parentSpanId must be a string no longer than 512 characters.' } });
	if (!Number.isFinite(startTime) || (endTime !== null && (!Number.isFinite(endTime) || endTime < startTime))) return res.status(400).json({ error: { code: 'INVALID_SPAN_TIMES', message: 'Span timestamps must be finite and endTime must not precede startTime.' } });
	const inputs = body.inputs || body.attributes || {};
	const outputs = body.outputs || {};
	const serializedInputs = JSON.stringify(inputs);
	const serializedOutputs = JSON.stringify(outputs);
	if (serializedInputs.length > 256 * 1024 || serializedOutputs.length > 256 * 1024) return res.status(413).json({ error: { code: 'SPAN_PAYLOAD_TOO_LARGE', message: 'Span inputs and outputs must each be no larger than 256 KiB.' } });
	if (body.error !== undefined && body.error !== null && (typeof body.error !== 'string' || body.error.length > 16 * 1024)) return res.status(400).json({ error: { code: 'INVALID_SPAN_ERROR', message: 'error must be a string no longer than 16 KiB.' } });
	if (parentSpanId) {
		const parent = await db.get(`SELECT id FROM trace_spans WHERE id = ? AND trace_id = ? AND ${scope.clause}`, parentSpanId, traceId, ...scope.params);
		if (!parent) return res.status(400).json({ error: { code: 'INVALID_PARENT_SPAN', message: 'parentSpanId must belong to the same trace and tenant.' } });
	}
	await db.run('INSERT OR REPLACE INTO trace_spans (id, trace_id, agent_id, parent_span_id, name, start_time, end_time, inputs_json, outputs_json, error, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, traceId, agentId, parentSpanId, name, startTime, endTime, serializedInputs, serializedOutputs, body.error || null, ...scope.params);
	res.status(201).json({ id, traceId, framework: body.framework || null });
} catch (e) { next(e); } }
async function replayTrace(req, res, next) { try { const db = await getDatabase(); const scope = scopeSql(req); const spans = await db.all(`SELECT * FROM trace_spans WHERE trace_id = ? AND ${scope.clause}`, req.params.traceId, ...scope.params); if (!spans.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Trace not found.' } }); return res.json(buildTraceReplay(req.params.traceId, spans)); } catch (e) { next(e); } }
module.exports = { listTraces, getTrace, ingestSpan, replayTrace, buildTraceReplay };

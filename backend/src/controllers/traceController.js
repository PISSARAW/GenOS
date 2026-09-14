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

function firstTruthy(values, fallback) {
	for (let index = 0; index < values.length; index += 1) {
		if (values[index]) return values[index];
	}
	return fallback;
}

function firstDefined(values, fallback) {
	for (let index = 0; index < values.length; index += 1) {
		if (values[index] !== undefined && values[index] !== null) return values[index];
	}
	return fallback;
}

function errorResponse(code, message, status) {
	return { status, body: { error: { code, message } } };
}

function normalizeSpanBody(raw) {
	if (!raw.framework) return raw;
	return frameworkAdapters.normalize(raw.framework, raw);
}

function invalidIdentifier(value) {
	if (typeof value !== 'string') return true;
	if (!value.trim()) return true;
	return value.length > 512;
}

function invalidParent(parentSpanId) {
	if (parentSpanId === null) return false;
	if (typeof parentSpanId !== 'string') return true;
	return parentSpanId.length > 512;
}

function invalidTimes(startTime, endTime) {
	if (!Number.isFinite(startTime)) return true;
	if (endTime === null) return false;
	if (!Number.isFinite(endTime)) return true;
	return endTime < startTime;
}

function tooLarge(value) {
	return value.length > 256 * 1024;
}

function invalidError(error) {
	if (error === undefined || error === null) return false;
	if (typeof error !== 'string') return true;
	return error.length > 16 * 1024;
}

function buildSpanInput(body) {
	const id = firstTruthy([body.spanId, body.id], `span-${crypto.randomUUID()}`);
	const traceId = firstTruthy([body.traceId, body.trace_id], `trace-${crypto.randomUUID()}`);
	const agentId = firstTruthy([body.agentId, body.agent_id], 'unknown');
	const parentSpanId = firstTruthy([body.parentSpanId, body.parent_span_id], null);
	const name = firstTruthy([body.name], 'span');
	const startValue = firstDefined([body.startTime, body.start_time], Date.now());
	const endValue = firstDefined([body.endTime, body.end_time], null);
	const inputs = body.inputs || body.attributes || {};
	const outputs = body.outputs || {};
	return {
		id,
		traceId,
		agentId,
		parentSpanId,
		name,
		startTime: Number(startValue),
		endTime: endValue === null || endValue === undefined ? null : Number(endValue),
		identifiers: [id, traceId, agentId, name],
		serializedInputs: JSON.stringify(inputs),
		serializedOutputs: JSON.stringify(outputs),
		error: body.error,
		errorValue: body.error || null
	};
}

function spanValidationError(span) {
	if (span.identifiers.some(invalidIdentifier)) return errorResponse('INVALID_SPAN_FIELDS', 'Span identifiers and name must be non-empty strings no longer than 512 characters.', 400);
	if (invalidParent(span.parentSpanId)) return errorResponse('INVALID_PARENT_SPAN', 'parentSpanId must be a string no longer than 512 characters.', 400);
	if (invalidTimes(span.startTime, span.endTime)) return errorResponse('INVALID_SPAN_TIMES', 'Span timestamps must be finite and endTime must not precede startTime.', 400);
	if (tooLarge(span.serializedInputs) || tooLarge(span.serializedOutputs)) return errorResponse('SPAN_PAYLOAD_TOO_LARGE', 'Span inputs and outputs must each be no larger than 256 KiB.', 413);
	if (invalidError(span.error)) return errorResponse('INVALID_SPAN_ERROR', 'error must be a string no longer than 16 KiB.', 400);
	return null;
}

async function verifyParent(db, scope, span) {
	if (!span.parentSpanId) return null;
	const parent = await db.get(`SELECT id FROM trace_spans WHERE id = ? AND trace_id = ? AND ${scope.clause}`, span.parentSpanId, span.traceId, ...scope.params);
	if (!parent) return errorResponse('INVALID_PARENT_SPAN', 'parentSpanId must belong to the same trace and tenant.', 400);
	return null;
}

async function insertSpan(db, scope, span) {
	await db.run('INSERT OR REPLACE INTO trace_spans (id, trace_id, agent_id, parent_span_id, name, start_time, end_time, inputs_json, outputs_json, error, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', span.id, span.traceId, span.agentId, span.parentSpanId, span.name, span.startTime, span.endTime, span.serializedInputs, span.serializedOutputs, span.errorValue, ...scope.params);
}

async function listTraces(req, res, next) { try { const db = await getDatabase(); const limit = boundedInteger(req.query.limit, 50, 1, 200); const scope = scopeSql(req, 't'); const rows = await db.all(`SELECT t.trace_id, COUNT(*) AS span_count, MIN(t.start_time) AS start_time, MAX(COALESCE(t.end_time, t.start_time)) AS end_time, SUM(CASE WHEN t.error IS NOT NULL THEN 1 ELSE 0 END) AS error_count FROM trace_spans t WHERE ${scope.clause} GROUP BY t.trace_id ORDER BY start_time DESC LIMIT ?`, ...scope.params, limit); res.json(rows.map((r) => ({ ...r, duration_ms: Math.max(0, r.end_time - r.start_time) }))); } catch (e) { next(e); } }
async function getTrace(req, res, next) { try { const db = await getDatabase(); const scope = scopeSql(req); const spans = await db.all(`SELECT * FROM trace_spans WHERE trace_id = ? AND ${scope.clause} ORDER BY start_time ASC`, req.params.traceId, ...scope.params); if (!spans.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Trace not found.' } }); res.json({ traceId: req.params.traceId, spans: spans.map(map) }); } catch (e) { next(e); } }
async function ingestSpan(req, res, next) {
	try {
		const db = await getDatabase();
		const scope = scopeSql(req);
		const body = normalizeSpanBody(req.body || {});
		const span = buildSpanInput(body);
		const invalid = spanValidationError(span);
		if (invalid) return res.status(invalid.status).json(invalid.body);
		const parentInvalid = await verifyParent(db, scope, span);
		if (parentInvalid) return res.status(parentInvalid.status).json(parentInvalid.body);
		await insertSpan(db, scope, span);
		res.status(201).json({ id: span.id, traceId: span.traceId, framework: body.framework || null });
	} catch (e) { next(e); }
}
async function replayTrace(req, res, next) { try { const db = await getDatabase(); const scope = scopeSql(req); const spans = await db.all(`SELECT * FROM trace_spans WHERE trace_id = ? AND ${scope.clause}`, req.params.traceId, ...scope.params); if (!spans.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Trace not found.' } }); return res.json(buildTraceReplay(req.params.traceId, spans)); } catch (e) { next(e); } }
module.exports = { listTraces, getTrace, ingestSpan, replayTrace, buildTraceReplay };

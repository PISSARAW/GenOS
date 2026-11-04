import http from 'node:http';
import ledgerApi from './proxy-ledger.cjs';
import protocol from './protocol.json' with {type: 'json'};
import {verifyModel} from './model-pin.mjs';

async function bodyOf(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2 * 1024 * 1024) throw Error('DPB_REQUEST_TOO_LARGE');
  }
  return body;
}
function boundedRequest(context, body) {
  const input = JSON.parse(body);
  if (input.model !== protocol.model) throw Error('DPB_MODEL_ROUTE_CHANGED');
  const index = context.ledger.state.calls++;
  return {index, request: {...input, options: {...input.options,
    num_ctx: protocol.contextTokens,
    num_predict: outputLimit(input.options?.num_predict),
    seed: context.options.seed + index * 104729}}};
}
function outputLimit(value) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, protocol.maxOutputTokens)
    : protocol.maxOutputTokens;
}
async function consume(result, response) {
  let raw = '';
  const decoder = new TextDecoder();
  response.writeHead(result.status, {'content-type': result.headers.get('content-type') || 'application/json'});
  for await (const chunk of result.body) {
    raw += decoder.decode(chunk, {stream: true});
    response.write(chunk);
  }
  return raw + decoder.decode();
}
async function dispatch(context, body, response) {
  const {ledger} = context;
  if (!ledgerApi.available(ledger.state) || Date.now() >= context.deadline) {
    ledgerApi.record(ledger, {type: 'budget-refusal', ...ledger.state});
    response.writeHead(429); response.end(JSON.stringify({error: 'DPB_SHARED_BUDGET_EXHAUSTED'})); return;
  }
  await verifyModel(context);
  const {index, request} = boundedRequest(context, body);
  ledgerApi.record(ledger, {type: 'dispatch', index, request, requestHash: ledgerApi.digest(JSON.stringify(request))});
  try {
    const result = await fetch(context.options.upstream + '/api/chat', {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(request),
      signal: AbortSignal.timeout(Math.max(1, Math.min(protocol.requestTimeoutMs, context.deadline - Date.now())))});
    const raw = await consume(result, response);
    ledgerApi.usage(ledger, {raw, index, status: result.status, ok: result.ok});
    response.end();
  } catch (error) {
    ledger.state.unknown = true;
    ledgerApi.record(ledger, {type: 'transport-error', index, error: String(error)});
    if (!response.headersSent) response.writeHead(502);
    response.end();
  }
}
async function auxiliary(context, request, response) {
  const allowed = ['/api/tags', '/api/ps', '/api/version', '/api/show', '/api/embed', '/api/embeddings'];
  if (!allowed.includes(request.url)) throw Error('DPB_AUXILIARY_ROUTE_FORBIDDEN');
  const body = await bodyOf(request);
  const result = await fetch(context.options.upstream + request.url, {method: request.method,
    headers: {'content-type': 'application/json'}, ...(body ? {body} : {}), signal: AbortSignal.timeout(30000)});
  const raw = await consume(result, response);
  ledgerApi.record(context.ledger, {type: 'auxiliary', route: request.url, status: result.status,
    requestHash: ledgerApi.digest(body), responseHash: ledgerApi.digest(raw)});
  response.end();
}
async function handle(context, request, response) {
  try {
    if (request.url !== '/api/chat') return await auxiliary(context, request, response);
    const body = await bodyOf(request);
    const work = context.queue.then(() => dispatch(context, body, response));
    context.queue = work.catch(() => {});
    await work;
  } catch (error) {
    ledgerApi.record(context.ledger, {type: 'proxy-error', error: String(error)});
    if (!response.headersSent) response.writeHead(500);
    response.end(JSON.stringify({error: String(error)}));
  }
}
async function close(context) {
  await context.queue;
  await new Promise(resolve => context.server.close(resolve));
}
export async function openProxy(options) {
  const context = {options, ledger: ledgerApi.create(options.directory), queue: Promise.resolve(),
    deadline: Date.now() + protocol.trialTimeoutMs};
  await verifyModel(context);
  context.server = http.createServer((request, response) => handle(context, request, response));
  await new Promise(resolve => context.server.listen(0, '127.0.0.1', resolve));
  return {endpoint: 'http://127.0.0.1:' + context.server.address().port,
    state: context.ledger.state, records: context.ledger.records, close: () => close(context)};
}

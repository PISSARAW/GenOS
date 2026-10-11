'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function settings() {
  const endpoint = process.env.GENOS_EXTERNAL_CREDIT_URL;
  const token = process.env.GENOS_EXTERNAL_CREDIT_TOKEN;
  const keyPath = process.env.GENOS_EXTERNAL_CREDIT_PUBLIC_KEY_PATH;
  if (!endpoint || !token || !keyPath) {
    throw failure('EXTERNAL_CREDIT_UNCONFIGURED', 'External credit provider configuration is required.');
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    throw failure('EXTERNAL_CREDIT_ENDPOINT_INVALID', 'Controlled provider must use loopback HTTP.');
  }
  return { url, token, publicKey: fs.readFileSync(keyPath) };
}

async function request(route, input, method = 'GET') {
  const config = settings();
  const url = new URL(route, config.url);
  const options = { method, headers: { 'x-provider-token': config.token },
    signal: AbortSignal.timeout(5000) };
  if (method === 'GET' && input) {
    for (const [key, value] of Object.entries(input)) url.searchParams.set(key, String(value));
  }
  if (method !== 'GET') {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(input);
  }
  let response;
  try { response = await fetch(url, options); }
  catch (error) { throw failure('EXTERNAL_CREDIT_UNAVAILABLE', error.message); }
  const result = await response.json();
  if (!response.ok) throw failure(result.code || 'EXTERNAL_CREDIT_DENIED', result.error || 'Provider refused operation.');
  return result;
}

function verify(signed, expectedSchema) {
  const statement = signed?.statement;
  const signature = signed?.signature;
  if (!statement || statement.schema !== expectedSchema || typeof signature !== 'string') {
    throw failure('EXTERNAL_CREDIT_PROOF_INVALID', 'Signed provider statement is missing.');
  }
  const config = settings();
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(JSON.stringify(statement)),
      config.publicKey, Buffer.from(signature, 'base64'));
  } catch (_) {}
  if (!valid) throw failure('EXTERNAL_CREDIT_PROOF_INVALID', 'Provider signature is invalid.');
  return statement;
}

function bound(statement, account) {
  return statement.tenantId === account.tenantId
    && statement.missionId === account.missionId
    && statement.agentId === account.agentId
    && statement.providerId === 'controlled-credit-provider'
    && statement.unit === 'execution_credit';
}

function validObservationNumbers(value) {
  return Number.isSafeInteger(value.balance) && Number.isSafeInteger(value.capacity)
    && value.balance >= 0 && value.capacity > 0 && value.balance <= value.capacity
    && Number.isSafeInteger(value.accountVersion) && value.accountVersion >= 0;
}

function checkObservation(signed, account) {
  const value = verify(signed, 'genos.external-credit-observation/v1');
  const age = Date.now() - Date.parse(value.observedAt);
  if (!bound(value, account) || !Number.isFinite(age) || age < -5000 || age > 30000
    || !validObservationNumbers(value)) {
    throw failure('EXTERNAL_CREDIT_MEASUREMENT_INVALID', 'Provider observation is stale or inconsistent.');
  }
  return value;
}

async function balance(account) {
  return checkObservation(await request('/balance', account), account);
}

function checkReceipt(signed, input) {
  const value = verify(signed, 'genos.external-credit-receipt/v1');
  if (!bound(value, input) || value.kind !== 'external_refill'
    || value.operationId !== input.operationId || value.amount !== input.amount
    || value.beforeVersion !== input.expectedVersion
    || value.afterVersion !== value.beforeVersion + 1
    || value.after !== value.before + value.amount
    || value.reserveAfter !== value.reserveBefore - value.amount) {
    throw failure('EXTERNAL_CREDIT_RECEIPT_INVALID', 'Provider receipt does not match the authorized transfer.');
  }
  return value;
}

async function transfer(input) {
  const receipt = await request('/transfer', input, 'POST');
  const value = checkReceipt(receipt, input);
  const observed = await balance(input);
  if (observed.accountVersion !== value.afterVersion || observed.balance !== value.after) {
    throw failure('EXTERNAL_CREDIT_MEASUREMENT_MISMATCH', 'Independent balance read does not match the receipt.');
  }
  return { receipt, observation: observed };
}

async function operation(input) {
  const receipt = await request('/operation', { operationId: input.operationId });
  return checkReceipt(receipt, input);
}

async function ledger() {
  return request('/ledger');
}

module.exports = { balance, transfer, operation, ledger, verify, checkReceipt };

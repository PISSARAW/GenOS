'use strict';

const fs = require('node:fs');
const path = require('node:path');

function appendDurable(filename, event) {
  const descriptor = fs.openSync(filename, 'a');
  try {
    fs.writeSync(descriptor, `${JSON.stringify(event)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseEvents(filename) {
  const content = fs.readFileSync(filename, 'utf8');
  if (content && !content.endsWith('\n')) throw new Error('Usage journal has an incomplete final event.');
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function replayJournal(filename) {
  let pending = null;
  let tokens = 0;
  let calls = 0;
  for (const event of parseEvents(filename)) {
    if (event.type === 'dispatch' && !pending && event.sequence === calls + 1) pending = event;
    else if (isResponse(event, pending)) {
      if (event.measured !== true || !Number.isSafeInteger(event.tokens) || event.tokens < 0) {
        throw new Error('Usage journal contains a provider response without measured token usage.');
      }
      tokens += event.tokens;
      calls += 1;
      pending = null;
    } else throw new Error('Usage journal sequence is invalid; refusing resume.');
  }
  if (pending) throw new Error('Usage journal has an interrupted provider call with unknown usage.');
  return { tokens, calls };
}

function isResponse(event, pending) {
  return event.type === 'response' && pending && event.sequence === pending.sequence;
}

function createUsageJournal(options) {
  const filename = `${path.resolve(options.output)}.usage.jsonl`;
  if (options.resume) return resumeJournal(filename, options);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, '', { flag: 'wx' });
  options.report.usageJournalPath = filename;
  options.report.providerCallCount = 0;
  options.report.pendingProviderCall = null;
  return callbacks(filename, options);
}

function resumeJournal(filename, options) {
  if (!fs.existsSync(filename) || options.report.usageJournalPath !== filename) {
    throw new Error('Campaign usage journal is missing or does not match this receipt.');
  }
  const replayed = replayJournal(filename);
  const receiptPending = options.report.pendingProviderCall;
  if (receiptPending && (!Number.isSafeInteger(receiptPending.sequence)
    || receiptPending.sequence < 1 || receiptPending.sequence > replayed.calls)) {
    throw new Error('Receipt records a pending provider call absent from the usage journal; refusing resume.');
  }
  if (options.report.measuredTokens > replayed.tokens
    || options.report.providerCallCount > replayed.calls) {
    throw new Error('Usage journal is behind the receipt; refusing resume because spend may be understated.');
  }
  options.report.measuredTokens = replayed.tokens;
  options.report.providerCallCount = replayed.calls;
  options.report.pendingProviderCall = null;
  return { ...callbacks(filename, options), initialTokens: replayed.tokens,
    initialSequence: replayed.calls };
}

function callbacks(filename, options) {
  function onDispatch(call) {
    const event = { type: 'dispatch', ...call };
    appendDurable(filename, event);
    options.report.pendingProviderCall = event;
    options.report.lastProviderCallStage = call.context.stage || 'unspecified';
    options.persist();
  }
  function onResponse(call) {
    const event = { type: 'response', sequence: call.sequence, reservedTokens: call.reservedTokens,
      context: call.context, measured: call.measured, tokens: call.tokens,
      inputTokens: call.inputTokens, outputTokens: call.outputTokens,
      model: call.model, provider: call.provider, elapsedMs: call.elapsedMs, error: call.error || null };
    appendDurable(filename, event);
    options.report.pendingProviderCall = null;
    options.report.providerCallCount += 1;
    if (event.measured) options.report.measuredTokens += event.tokens;
    options.report.lastProviderCall = event;
    options.persist();
  }
  return { onDispatch, onResponse };
}

module.exports = { appendDurable, parseEvents, replayJournal, createUsageJournal };

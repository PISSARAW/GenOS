'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLedger } = require('../adapters/localModel');
const { createCampaignBudgetGuard } = require('../adapters/campaignBudgetGuard');
const { createUsageJournal } = require('../adapters/campaignUsageJournal');

function reportFor(output) {
  return { status: 'running', measuredTokens: 0, providerCallCount: 0,
    pendingProviderCall: null, usageJournalPath: null, output };
}

function persist(output, report) {
  fs.writeFileSync(output, JSON.stringify(report));
}

async function testPerCallCeilingAndResume() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-budget-guard-'));
  try {
    const output = path.join(folder, 'receipt.json');
    const report = reportFor(output);
    persist(output, report);
    const journal = createUsageJournal({ output, report, persist: () => persist(output, report) });
    let calls = 0;
    const fakeGenerate = async () => {
      calls += 1;
      return { text: '{}', inputTokens: 999, outputTokens: 1,
        tokenUsageMeasured: true, provider: 'ollama', servedModel: 'fixture' };
    };
    const guard = createCampaignBudgetGuard({ tokenBudget: 1200,
      onDispatch: journal.onDispatch, onResponse: journal.onResponse });
    const ledger = createLedger({ generate: fakeGenerate, budgetGuard: guard });
    await ledger.generateJson({ model: 'ollama://fixture', prompt: 'step one', maxTokens: 100 });
    assert.equal(report.measuredTokens, 1000);
    assert.equal(report.providerCallCount, 1);

    const recovered = createUsageJournal({ output, report, resume: true,
      persist: () => persist(output, report) });
    assert.equal(recovered.initialTokens, 1000);
    assert.equal(recovered.initialSequence, 1);
    const resumedGuard = createCampaignBudgetGuard({ tokenBudget: 1200,
      initialTokens: recovered.initialTokens, initialSequence: recovered.initialSequence,
      onDispatch: recovered.onDispatch, onResponse: recovered.onResponse });
    const resumedLedger = createLedger({ generate: fakeGenerate, budgetGuard: resumedGuard });
    await assert.rejects(() => resumedLedger.generateJson({ model: 'ollama://fixture',
      prompt: 'step two', maxTokens: 100 }), /exceeds remaining campaign budget/);
    assert.equal(calls, 1);
    assert.equal(report.measuredTokens, 1000);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function testUnknownUsageStopsAndCannotResume() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-budget-unknown-'));
  try {
    const output = path.join(folder, 'receipt.json');
    const report = reportFor(output);
    persist(output, report);
    const journal = createUsageJournal({ output, report, persist: () => persist(output, report) });
    let calls = 0;
    const guard = createCampaignBudgetGuard({ tokenBudget: 12000,
      onDispatch: journal.onDispatch, onResponse: journal.onResponse });
    const ledger = createLedger({ budgetGuard: guard, generate: async () => {
      calls += 1;
      return { text: '{}', inputTokens: null, outputTokens: null,
        tokenUsageMeasured: false, provider: 'ollama', servedModel: 'fixture' };
    } });
    await assert.rejects(() => ledger.generateJson({ model: 'ollama://fixture',
      prompt: 'step', maxTokens: 100 }), /usage is missing or invalid/);
    assert.equal(report.measuredTokens, 0);
    assert.equal(report.providerCallCount, 1);
    assert.equal(guard.stopReason, 'provider_usage_unmeasured');
    await assert.rejects(() => ledger.generateJson({ model: 'ollama://fixture',
      prompt: 'step two', maxTokens: 100 }), /Campaign stopped/);
    assert.equal(calls, 1);
    assert.throws(() => createUsageJournal({ output, report, resume: true,
      persist: () => persist(output, report) }), /without measured token usage/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function testInterruptedDispatchFailsClosed() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-budget-interrupted-'));
  try {
    const output = path.join(folder, 'receipt.json');
    const report = reportFor(output);
    persist(output, report);
    const journal = createUsageJournal({ output, report, persist: () => persist(output, report) });
    const guard = createCampaignBudgetGuard({ tokenBudget: 12000,
      onDispatch: journal.onDispatch, onResponse: journal.onResponse });
    guard.beginCall({ prompt: 'dispatched but no receipt yet', maxTokens: 100 });
    assert.equal(report.pendingProviderCall.sequence, 1);
    assert.throws(() => createUsageJournal({ output, report, resume: true,
      persist: () => persist(output, report) }), /interrupted provider call/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function testTruncatedJournalCannotLowerSpend() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-budget-truncated-'));
  try {
    const output = path.join(folder, 'receipt.json');
    const report = reportFor(output);
    persist(output, report);
    const journal = createUsageJournal({ output, report, persist: () => persist(output, report) });
    const guard = createCampaignBudgetGuard({ tokenBudget: 12000,
      onDispatch: journal.onDispatch, onResponse: journal.onResponse });
    const ledger = createLedger({ budgetGuard: guard, generate: async () => ({ text: '{}',
      inputTokens: 500, outputTokens: 10, tokenUsageMeasured: true,
      provider: 'ollama', servedModel: 'fixture' }) });
    await ledger.generateJson({ model: 'ollama://fixture', prompt: 'completed step', maxTokens: 100 });
    assert.equal(report.measuredTokens, 510);
    assert.equal(report.providerCallCount, 1);
    fs.writeFileSync(`${output}.usage.jsonl`, '');
    assert.throws(() => createUsageJournal({ output, report, resume: true,
      persist: () => persist(output, report) }), /journal is behind the receipt/);
    assert.equal(report.measuredTokens, 510);
    assert.equal(report.providerCallCount, 1);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function testMissingPendingDispatchCannotResume() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ett-budget-pending-truncated-'));
  try {
    const output = path.join(folder, 'receipt.json');
    const report = reportFor(output);
    persist(output, report);
    const journal = createUsageJournal({ output, report, persist: () => persist(output, report) });
    const guard = createCampaignBudgetGuard({ tokenBudget: 12000,
      onDispatch: journal.onDispatch, onResponse: journal.onResponse });
    guard.beginCall({ prompt: 'dispatch persisted before crash', maxTokens: 100 });
    const pending = { ...report.pendingProviderCall };
    fs.writeFileSync(`${output}.usage.jsonl`, '');
    assert.throws(() => createUsageJournal({ output, report, resume: true,
      persist: () => persist(output, report) }), /pending provider call absent from the usage journal/);
    assert.deepEqual(report.pendingProviderCall, pending);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function testCampaignBudgetGuard() {
  await testPerCallCeilingAndResume();
  await testUnknownUsageStopsAndCannotResume();
  await testInterruptedDispatchFailsClosed();
  await testTruncatedJournalCannotLowerSpend();
  testMissingPendingDispatchCannotResume();
}

if (require.main === module) {
  testCampaignBudgetGuard().then(() => process.stdout.write('ETT per-call campaign token guard passed.\n'))
    .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}

module.exports = { testCampaignBudgetGuard };

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { defaultBrowserScout } = require('../src/services/browserScoutService');
const { forageStep } = require('../src/services/foragingLoopService');

async function capture(id, text) {
  await defaultBrowserScout.navigate(id, 'https://fixture.invalid/page', {
    htmlContent: `<html><body><h1>${text}</h1></body></html>`,
  });
  return forageStep({ sessionId: id, elapsedTimeSec: 1, iteration: 1 });
}

function digest(text) {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function verifyReceiptBinding(receipt, text) {
  assert.equal(receipt.observedTextDigest, digest(text));
  const material = { ...receipt };
  delete material.evidenceRef;
  assert.equal(receipt.evidenceRef, digest(JSON.stringify(material)));
}

async function run() {
  const firstId = 'foraging-receipt-digest-a';
  const secondId = 'foraging-receipt-digest-b';
  try {
    const first = await capture(firstId, 'release stable answer kestrel');
    const second = await capture(secondId, 'release changed answer osprey');
    verifyReceiptBinding(first.receipt, first.observation.observationText);
    verifyReceiptBinding(second.receipt, second.observation.observationText);
    assert.notEqual(first.receipt.observedTextDigest, second.receipt.observedTextDigest,
      'different observed content must produce a different content digest');
    console.log('Foraging receipt content binding: PASS');
  } finally {
    await defaultBrowserScout.closeSession(firstId);
    await defaultBrowserScout.closeSession(secondId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

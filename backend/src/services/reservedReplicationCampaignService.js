'use strict';

const crypto = require('node:crypto');

function buildManifest(input) {
  const data = input || {};
  if (!data.protocolId || !data.manifestHash || !Array.isArray(data.seeds) || data.seeds.length < 2) throw Object.assign(new Error('Reserved campaign requires protocol, manifest and seeds'), { code: 'INVALID_RESERVED_CAMPAIGN' });
  if (data.reservedTouched === true) throw Object.assign(new Error('Reserved corpus was touched before campaign'), { code: 'RESERVED_CONTAMINATION' });
  return { campaignId: data.campaignId || `campaign_${Date.now()}`, protocolId: data.protocolId, manifestHash: data.manifestHash, profile: data.profile || 'composed-perceptual', seeds: [...data.seeds], reserved: true, startedAt: new Date().toISOString() };
}

function wilson(successes, total) {
  if (!total) return { low: 0, high: 0 };
  const z = 1.96; const p = successes / total; const denominator = 1 + z * z / total; const center = (p + z * z / (2 * total)) / denominator; const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return { low: Math.max(0, center - spread), high: Math.min(1, center + spread) };
}

function summarize(results) {
  const list = Array.isArray(results) ? results : []; const successes = list.filter((result) => result?.status === 'success').length; const negatives = list.filter((result) => result?.status === 'failed' || result?.status === 'inconclusive').length;
  return { total: list.length, successes, negatives, successRate: list.length ? successes / list.length : 0, interval95: wilson(successes, list.length), results: list };
}

function artifactHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function finalizeCampaign(manifest, results) {
  const summary = summarize(results); const artifact = { manifest, summary }; return { manifest, summary, artifactHash: artifactHash(artifact), replayable: summary.total === manifest.seeds.length };
}

module.exports = { buildManifest, summarize, finalizeCampaign, artifactHash };

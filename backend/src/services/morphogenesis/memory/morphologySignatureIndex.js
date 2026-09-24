'use strict';

const crypto = require('crypto');

function signatureFor(profile = {}) {
  const stable = Object.keys(profile).sort().reduce((acc, key) => { acc[key] = profile[key]; return acc; }, {});
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function indexBySignature(entries = []) {
  return new Map(entries.filter((entry) => entry && entry.problemSignature).map((entry) => [entry.problemSignature, entry]));
}

module.exports = { indexBySignature, signatureFor };

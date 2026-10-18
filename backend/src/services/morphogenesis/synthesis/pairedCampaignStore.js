'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function shaJson(value) {
  const bytes = JSON.stringify(canonical(value));
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function safeIdentifier(value, field) {
  const text = String(value || '');
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(text)) throw new Error(`${field} is not a safe identifier.`);
  return text;
}

function receiptWithHash(receipt) {
  const body = { ...receipt };
  delete body.receiptHash;
  return { ...body, receiptHash: shaJson(body) };
}

function verifyReceipt(receipt) {
  const expected = receiptWithHash(receipt).receiptHash;
  if (receipt.receiptHash !== expected) throw new Error('Campaign receipt hash mismatch.');
  return receipt;
}

class PairedCampaignStore {
  constructor(options = {}) {
    this.campaignId = safeIdentifier(options.campaignId, 'campaignId');
    this.root = path.resolve(options.root || '.');
    this.directory = path.join(this.root, this.campaignId);
    this.attemptsDirectory = path.join(this.directory, 'attempts');
    this.leasesDirectory = path.join(this.directory, 'leases');
    this.sealsDirectory = path.join(this.directory, 'seals');
  }

  initialize(manifest) {
    fs.mkdirSync(this.attemptsDirectory, { recursive: true });
    fs.mkdirSync(this.leasesDirectory, { recursive: true });
    fs.mkdirSync(this.sealsDirectory, { recursive: true });
    const file = path.join(this.directory, 'manifest.json');
    const record = { manifestHash: shaJson(manifest), manifest };
    if (!fs.existsSync(file)) atomicWrite(file, record);
    const persisted = readJson(file);
    if (persisted.manifestHash !== record.manifestHash
      || persisted.manifestHash !== shaJson(persisted.manifest)) {
      throw new Error('Campaign manifest changed after initialization.');
    }
    return persisted;
  }

  attemptId(identity) {
    return shaJson({ campaignId: this.campaignId, ...identity }).slice('sha256:'.length);
  }

  receiptFile(attemptId) {
    return path.join(this.attemptsDirectory, `${safeIdentifier(attemptId, 'attemptId')}.json`);
  }

  leaseFile(attemptId) {
    return path.join(this.leasesDirectory, `${safeIdentifier(attemptId, 'attemptId')}.json`);
  }

  loadReceipt(attemptId) {
    const file = this.receiptFile(attemptId);
    return fs.existsSync(file) ? verifyReceipt(readJson(file)) : null;
  }

  createLease(input) {
    const lease = { schema: 'genos.morphogenesis.p3-lease/v1', attemptId: input.attemptId,
      inputHash: input.inputHash, leaseToken: crypto.randomUUID(), acquiredAt: input.now,
      expiresAt: new Date(Date.parse(input.now) + input.ttlMs).toISOString() };
    const file = this.leaseFile(input.attemptId);
    const descriptor = fs.openSync(file, 'wx');
    try { fs.writeFileSync(descriptor, `${JSON.stringify(lease, null, 2)}\n`, 'utf8'); }
    finally { fs.closeSync(descriptor); }
    return { status: 'acquired', lease };
  }

  acquireLease(input) {
    const completed = this.loadReceipt(input.attemptId);
    if (completed) return { status: 'completed', receipt: completed };
    const file = this.leaseFile(input.attemptId);
    try { return this.createLease(input); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const lease = readJson(file);
      if (lease.inputHash !== input.inputHash) throw new Error('Attempt lease input hash mismatch.');
      if (Date.parse(lease.expiresAt) > Date.parse(input.now)) return { status: 'leased', lease };
      fs.unlinkSync(file);
      return this.createLease(input);
    }
  }

  commitReceipt(input) {
    const existing = this.loadReceipt(input.attemptId);
    if (existing) return existing;
    const leaseFile = this.leaseFile(input.attemptId);
    if (!fs.existsSync(leaseFile)) throw new Error('Attempt lease is missing.');
    const lease = readJson(leaseFile);
    if (lease.leaseToken !== input.leaseToken || lease.inputHash !== input.inputHash) {
      throw new Error('Attempt lease authority mismatch.');
    }
    const receipt = receiptWithHash(input.receipt);
    atomicWrite(this.receiptFile(input.attemptId), receipt);
    fs.unlinkSync(leaseFile);
    return receipt;
  }

  listReceipts() {
    if (!fs.existsSync(this.attemptsDirectory)) return [];
    return fs.readdirSync(this.attemptsDirectory).filter(name => name.endsWith('.json')).sort()
      .map(name => verifyReceipt(readJson(path.join(this.attemptsDirectory, name))));
  }

  readSeal(split) {
    const file = path.join(this.sealsDirectory, `${safeIdentifier(split, 'split')}.json`);
    return fs.existsSync(file) ? readJson(file) : null;
  }

  sealSplit(input) {
    const receiptHashes = this.listReceipts().filter(item => item.observation?.split === input.split)
      .map(item => item.receiptHash).sort();
    if (receiptHashes.length !== input.expectedCount) throw new Error('Split is not terminal and complete.');
    const body = { schema: 'genos.morphogenesis.p3-split-seal/v1', campaignId: this.campaignId,
      split: input.split, expectedCount: input.expectedCount, receiptHashes };
    const seal = { ...body, sealHash: shaJson(body) };
    const file = path.join(this.sealsDirectory, `${safeIdentifier(input.split, 'split')}.json`);
    if (!fs.existsSync(file)) atomicWrite(file, seal);
    const persisted = readJson(file);
    if (persisted.sealHash !== seal.sealHash) throw new Error('Split seal changed after creation.');
    return persisted;
  }
}

module.exports = { PairedCampaignStore, canonical, shaJson };

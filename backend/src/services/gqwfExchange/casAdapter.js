'use strict';

const path = require('node:path');
const fs = require('node:fs');
const objects = require('../gqwf/objects');
const metadata = require('../gqwf/metadataStore');
const safety = require('./casSafety');

class CasAdapter {
  constructor(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('GQWF Exchange trusted absolute workspace root required.');
    this.root = path.resolve(root);
    const stat = fs.lstatSync(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !safety.samePath(fs.realpathSync(this.root), this.root)) {
      throw new Error('GQWF Exchange trusted workspace root is unsafe.');
    }
  }

  async prepare() {
    await safety.parents(this.root, ['.genos', 'gqwf', 'blobs']);
    await safety.parents(this.root, ['.genos', 'gqwf', 'metadata', 'objects']);
    await safety.parents(this.root, ['.genos', 'gqwf', 'metadata', 'refs', 'catalog']);
  }

  parts(hash, kind) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('GQWF Exchange raw SHA-256 hash required.');
    return kind === 'blob' ? ['.genos', 'gqwf', 'blobs', hash.slice(0, 2)]
      : ['.genos', 'gqwf', 'metadata', 'objects', hash.slice(0, 2)];
  }

  async checked(hash, options) {
    const parts = this.parts(hash, options.kind);
    const before = await safety.parents(this.root, parts);
    const result = await options.run();
    const after = await safety.parents(this.root, parts);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('GQWF Exchange CAS parent changed during access.');
    return result;
  }

  async read(blob) {
    if (!Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > safety.MAX_BLOB_BYTES) throw new Error('GQWF Exchange blob size exceeds profile bound.');
    return this.checked(blob.hash, { kind: 'blob', run: async () => {
      const target = objects.blobPath(this.root, blob.hash);
      const stat = await safety.privateFile(target, safety.MAX_BLOB_BYTES);
      if (stat.size !== blob.size) throw new Error('GQWF Exchange actual blob size mismatch.');
      const bytes = await objects.readBlob(this.root, blob.hash);
      await safety.privateFile(target, safety.MAX_BLOB_BYTES);
      if (bytes.length !== blob.size) throw new Error('GQWF Exchange actual blob size mismatch.');
      return bytes;
    } });
  }

  async has(blob) {
    try { await this.read(blob); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }

  async put(blob, bytes) {
    if (bytes.length !== blob.size || bytes.length > safety.MAX_BLOB_BYTES || objects.sha256(bytes) !== blob.hash) {
      throw new Error('GQWF Exchange transferred hash or size mismatch.');
    }
    return this.checked(blob.hash, { kind: 'blob', run: async () => {
      const hash = await objects.putBlob(this.root, bytes);
      if (hash !== blob.hash) throw new Error('GQWF Exchange stored blob identity mismatch.');
      await this.read(blob);
      return hash;
    } });
  }

  async metadata(hash, serialized) {
    if (Buffer.byteLength(serialized, 'utf8') > safety.MAX_METADATA_BYTES || metadata.digest(serialized) !== hash) {
      throw new Error('GQWF Exchange metadata hash or size mismatch.');
    }
    return this.checked(hash, { kind: 'metadata', run: async () => {
      const stored = await metadata.putObject(this.root, serialized);
      await safety.privateFile(metadata.objectPath(this.root, hash), safety.MAX_METADATA_BYTES);
      if (stored !== hash || await metadata.readObject(this.root, hash) !== serialized) throw new Error('GQWF Exchange stored metadata mismatch.');
      return hash;
    } });
  }

  async readMetadata(hash) {
    return this.checked(hash, { kind: 'metadata', run: async () => {
      await safety.privateFile(metadata.objectPath(this.root, hash), safety.MAX_METADATA_BYTES);
      return metadata.readObject(this.root, hash);
    } });
  }
}

module.exports = { CasAdapter };

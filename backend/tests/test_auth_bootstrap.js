const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ADMIN_SECRET = `genos_test_admin_${crypto.randomBytes(24).toString('hex')}`;
const DB_PATH = path.join(os.tmpdir(), `genos-auth-${process.pid}-${Date.now()}.db`);

process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_TOKEN = ADMIN_SECRET;
process.env.GENOS_DB_PATH = DB_PATH;

const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');

function request(port, token) {
  const body = JSON.stringify({ token });
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/auth/verify-token',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-csrf-token': 'test-csrf-token'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function main() {
  const db = await getDatabase();
  const record = await db.get('SELECT id, key_hash FROM access_keys WHERE id = ?', 'key-bootstrap-admin');
  assert(record, 'bootstrap administrator record must exist');
  assert.notEqual(record.key_hash, ADMIN_SECRET, 'database must not contain the raw secret');
  assert.equal(record.key_hash, crypto.createHash('sha256').update(ADMIN_SECRET).digest('hex'));

  const server = http.createServer(createApp());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const publicId = await request(port, 'key-bootstrap-admin');
    assert.equal(publicId.status, 401, 'public access-key ID must never authenticate');
    assert.equal(publicId.body.valid, false);

    const secret = await request(port, ADMIN_SECRET);
    assert.equal(secret.status, 200, 'bootstrap secret must authenticate by its hash');
    assert.equal(secret.body.valid, true);
    assert.equal(secret.body.role, 'admin');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(`${DB_PATH}${suffix}`); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
}

main().then(() => {
  console.log('Bootstrap authentication checks passed.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});

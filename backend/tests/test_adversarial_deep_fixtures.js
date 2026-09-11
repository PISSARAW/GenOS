const http = require('http');

let stats = {
  totalAsserts: 0,
  passedAsserts: 0
};

function assert(condition, message) {
  stats.totalAsserts++;
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  stats.passedAsserts++;
  console.log(`  ✅ PASS: ${message}`);
}

function sendReq(port, options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: 'localhost',
      port,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'valid-session-csrf-token',
        ...(options.headers || {})
      }
    };
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

module.exports = {
  stats,
  assert,
  sendReq
};

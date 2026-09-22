'use strict';

/**
 * @file testUtils.js
 * @description Shared utilities for backend tests
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

function createTestDbPath() {
  return path.resolve(__dirname, `test_genos_${process.pid}.db`);
}

function createTestWorkspacePath() {
  return path.join(__dirname, `.tmp-ws-genos-core-${process.pid}`);
}

function setupTestEnvironment(testDbPath, testWorkspacePath) {
  process.env.GENOS_DB_PATH = testDbPath;
  process.env.NODE_ENV = 'test';
  return { testDbPath, testWorkspacePath };
}

function cleanupTestFiles(testDbPath, testWorkspacePath) {
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }
  if (testWorkspacePath && fs.existsSync(testWorkspacePath)) {
    fs.rmSync(testWorkspacePath, { recursive: true, force: true });
  }
}

function createTestRequest(actualPort, token, skipDefaultAuth) {
  return function request(options, body = null) {
    const { skipDefaultAuth: optSkipAuth, ...reqOptions } = options;
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: actualPort,
        ...reqOptions,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token',
          ...(skipDefaultAuth || optSkipAuth ? {} : { 'Authorization': `Bearer ${token}` }),
          ...(reqOptions.headers || {})
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) { json = data; }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  };
}

function createAssert(passedCount, failedCount) {
  return function assert(condition, message) {
    if (!condition) {
      failedCount.count++;
      console.error(`  ❌ FAIL: ${message}`);
      throw new Error(message);
    } else {
      passedCount.count++;
      console.log(`  ✅ PASS: ${message}`);
    }
  };
}

module.exports = {
  createTestDbPath,
  createTestWorkspacePath,
  setupTestEnvironment,
  cleanupTestFiles,
  createTestRequest,
  createAssert,
};
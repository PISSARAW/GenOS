const crypto = require('crypto');

function testToken(role) {
  return `genos_test_${role}_${crypto.randomBytes(16).toString('hex')}`;
}

const TEST_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || testToken('admin');
const TEST_OPERATOR_TOKEN = process.env.GENOS_TEST_OPERATOR_TOKEN || testToken('operator');
const TEST_VIEWER_TOKEN = process.env.GENOS_TEST_VIEWER_TOKEN || testToken('viewer');

process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_TOKEN = TEST_ADMIN_TOKEN;
process.env.GENOS_TEST_OPERATOR_TOKEN = TEST_OPERATOR_TOKEN;
process.env.GENOS_TEST_VIEWER_TOKEN = TEST_VIEWER_TOKEN;

module.exports = { TEST_ADMIN_TOKEN, TEST_OPERATOR_TOKEN, TEST_VIEWER_TOKEN };

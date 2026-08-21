/**
 * Legacy Database export wrapper — forwards to modular src/db
 */

const { getDatabase, closeDatabase, withTransaction } = require('./src/db');

module.exports = {
  getDatabase,
  closeDatabase,
  withTransaction
};

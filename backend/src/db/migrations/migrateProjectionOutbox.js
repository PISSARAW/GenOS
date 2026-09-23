'use strict';

const outbox = require('../../storage/projection/projectionOutbox');

module.exports = {
  async run(db) {
    await outbox.ensureOutboxTables(db);
  }
};

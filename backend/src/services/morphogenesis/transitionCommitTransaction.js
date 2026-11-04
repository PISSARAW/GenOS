'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../db');

async function atomicCommit(db, callback) {
  return withTransaction(db, async () => {
    const name = `morph_commit_${randomUUID().replaceAll('-', '')}`;
    await db.exec(`SAVEPOINT ${name}`);
    try {
      const result = await callback();
      await db.exec(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
      await db.exec(`RELEASE SAVEPOINT ${name}`);
      throw error;
    }
  });
}

module.exports = { atomicCommit };

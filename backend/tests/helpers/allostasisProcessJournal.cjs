'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { validateMessage } = require('../../src/services/allostasisProtocol/contract');
const fixture = require('./allostasisProcessFixtures.cjs');

class ClientJournal {
  constructor(directory, role) {
    this.role = role;
    this.db = new Database(path.join(directory, 'client.sqlite'));
    this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL,
      direction TEXT NOT NULL, fingerprint TEXT NOT NULL, body TEXT NOT NULL
    )`);
  }

  close() { this.db.close(); }

  record(input, direction) {
    const message = validateMessage(input);
    const local = fixture.ACTORS[this.role];
    const actor = direction === 'outbound' ? message.sender : message.audience;
    const remote = direction === 'outbound' ? message.audience : message.sender;
    if (digest(actor) !== digest(local) || digest(remote) !== digest(fixture.ACTORS.regulator)) throw new Error('Client journal actor binding mismatch.');
    if (digest(message.scope) !== digest(fixture.SCOPE) || message.missionId !== fixture.MISSION) throw new Error('Client journal scope mismatch.');
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT * FROM messages WHERE message_id = ?').get(message.messageId);
      if (prior && (prior.fingerprint !== digest(message) || prior.direction !== direction)) throw new Error('Client journal idempotency conflict.');
      if (!prior) this.db.prepare('INSERT INTO messages(message_id,direction,fingerprint,body) VALUES (?,?,?,?)')
        .run(message.messageId, direction, digest(message), JSON.stringify(message));
      return { status: 'recorded', direction, messageId: message.messageId };
    })();
  }

  messages(direction) {
    return this.db.prepare('SELECT * FROM messages WHERE direction = ? ORDER BY sequence').all(direction).map(row => {
      const message = JSON.parse(row.body);
      if (digest(message) !== row.fingerprint) throw new Error('Client journal integrity mismatch.');
      return message;
    });
  }
}

module.exports = { ClientJournal };

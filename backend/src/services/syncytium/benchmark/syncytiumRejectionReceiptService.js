'use strict';

async function record(db, args, error, callerId) {
  const sessionId = String(args?.session_id || args?.sessionId || '').trim();
  if (!db || !sessionId || !error?.code) return;
  await db.run(`CREATE TABLE IF NOT EXISTS syncytium_rejection_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL, action TEXT NOT NULL, code TEXT NOT NULL,
    op_id TEXT, caller_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const action = String(args.variant_action || args.operation || 'unknown');
  const input = args.variant_input || {};
  const opId = input.opId || input.o?.opId || input.change?.opId
    || input.result?.opId || input.build?.opId || input.operation?.opId
    || args.op?.opId || null;
  await db.run(`INSERT INTO syncytium_rejection_receipts
    (session_id, action, code, op_id, caller_id) VALUES (?, ?, ?, ?, ?)`,
  sessionId, action, error.code, opId, callerId || null);
}

module.exports = { record };

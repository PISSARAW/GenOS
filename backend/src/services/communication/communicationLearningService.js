'use strict';

const { getDatabase } = require('../../db');
const { recordOutcome } = require('./transactiveMemoryService');
const { recordGrounding } = require('./commonGroundService');
const { recordUsage, observePhrase } = require('./dialectService');
const { recordSignalOutcome } = require('../synapticPlasticityService');
const { recordLlmWakeup, recordLlmWakeupOutcome, recordSignalWithAction, recordImpact } = require('../signalMetricsService');

function isVerbalChannel(channel) {
  return channel === 'MICRO_UTTERANCE' || channel === 'DIALOGUE' || channel === 'HUMAN';
}

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureOutcomeTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
    domain TEXT, refs_json TEXT NOT NULL DEFAULT '[]', channel TEXT, outcome TEXT NOT NULL,
    action_taken INTEGER NOT NULL DEFAULT 0, recipient_knew INTEGER NOT NULL DEFAULT 0,
    tokens_used INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(refs_json))
  );
  CREATE INDEX IF NOT EXISTS idx_communication_outcomes_pair ON communication_outcomes(sender_id, receiver_id, created_at);`);
  return db;
}

function mapOutcome(query) {
  if (query.dialectError) return 'error';
  if (query.actionTaken && query.interpretationCorrect !== false) return 'action_taken';
  if (query.recipientKnew) return 'no_effect';
  return 'ignored';
}

async function journalOutcome(db, query, outcome) {
  const result = await db.run(
    `INSERT INTO communication_outcomes
      (sender_id, receiver_id, domain, refs_json, channel, outcome, action_taken, recipient_knew, tokens_used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [query.senderId, query.receiverId, query.domain || null, JSON.stringify(query.semanticRefs || []),
      query.channel || 'structured', outcome, query.actionTaken ? 1 : 0,
      query.recipientKnew ? 1 : 0, Number(query.tokensUsed || 0)]
  );
  return result.lastID;
}

async function learnExpertise(query) {
  if (!query.domain || query.recipientKnew) return null;
  const success = Boolean(query.actionTaken && query.interpretationCorrect !== false);
  return recordOutcome({ db: query.db, agentId: query.receiverId, domain: query.domain, success });
}

async function learnCommonGround(query) {
  if (!query.recipientKnew) return 0;
  const refs = query.semanticRefs || [];
  let noted = 0;
  for (const ref of refs) {
    await recordGrounding({
      db: query.db, agentA: query.senderId, agentB: query.receiverId,
      domain: query.domain || 'general', semanticFingerprint: ref, status: 'grounded', confidence: 0.6
    });
    noted += 1;
  }
  return noted;
}

async function learnDialect(query) {
  const learned = { usage: false, phrase: false };
  if (query.dialectId && query.dialectSymbol) {
    await recordUsage({
      db: query.db, dialectId: query.dialectId, symbol: query.dialectSymbol,
      success: query.dialectSuccess !== false
    });
    learned.usage = true;
  }
  if (query.phraseSample && query.semanticRefs && query.semanticRefs.length > 0) {
    await observePhrase({
      db: query.db, participants: [query.senderId, query.receiverId], domain: query.domain || 'general',
      phrase: query.phraseSample, semanticFingerprint: query.semanticRefs[0], success: query.actionTaken
    });
    learned.phrase = true;
  }
  return learned;
}

async function learnRelation(query) {
  const delta = query.actionTaken ? 0.05 : -0.05;
  const result = await query.db.run(
    `UPDATE agent_relations SET interaction_count = interaction_count + 1,
       familiarity = MIN(1.0, MAX(0.0, familiarity + ?)),
       metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.familiarity', MIN(1.0, MAX(0.0, familiarity + ?)),
         '$.interactionCount', interaction_count + 1),
       last_interaction = CURRENT_TIMESTAMP
     WHERE (source_agent_id = ? AND target_agent_id = ?) OR (source_agent_id = ? AND target_agent_id = ?)`,
    [delta, delta, query.senderId, query.receiverId, query.receiverId, query.senderId]
  );
  return { noted: result.changes > 0 };
}

function learnChannel(query, outcome, success) {
  recordSignalOutcome({
    senderId: query.senderId, receiverId: query.receiverId,
    outcome, signalType: query.channel || 'structured'
  });
  if (isVerbalChannel(query.channel)) {
    recordLlmWakeup();
    recordLlmWakeupOutcome({ useful: success });
    return 'verbal';
  }
  if (success) {
    recordSignalWithAction();
    return 'acted';
  }
  recordImpact(0, Number(query.tokensUsed || 0));
  return 'wasted';
}

async function learnFromOutcome(input) {
  const db = await ensureOutcomeTables(input.db);
  const query = Object.assign({}, input, { db });
  const outcome = mapOutcome(query);
  const success = outcome === 'action_taken';
  const journalId = await journalOutcome(db, query, outcome);
  const expertise = await learnExpertise(query);
  const groundCorrections = await learnCommonGround(query);
  const dialect = await learnDialect(query);
  const relation = await learnRelation(query);
  const channel = learnChannel(query, outcome, success);
  return { journalId, outcome, success, expertise: Boolean(expertise), groundCorrections, dialect, relation, channel };
}

module.exports = { learnFromOutcome };

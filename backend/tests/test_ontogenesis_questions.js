'use strict';

const assert = require('assert');

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  const { migrateOntogenesisConversation } = require('../src/db/migrations/migrateOntogenesisConversation');
  const { migrateOntogenesisQuestions } = require('../src/db/migrations/migrateOntogenesisQuestions');
  await migrateOntogenesis(db);
  await migrateOntogenesisConversation(db);
  await migrateOntogenesisQuestions(db);
  return db;
}

(async () => {
  const questions = require('../src/services/ontogenesis/questionService');
  const store = require('../src/services/ontogenesis/projectStore');
  const inbox = require('../src/services/ontogenesis/inboxService');

  const db = await memoryDb();
  const pid = await store.createProject(db, { rootPath: 'C:/proj', branch: 'codex/ontogenesis', objective: 'q' });

  // Kinds validés, choix exigés pour choice.
  await assert.rejects(questions.askQuestion(db, { projectId: pid, kind: 'hasard', question: '?' }), /question-kind-inconnu/);
  await assert.rejects(questions.askQuestion(db, { projectId: pid, kind: 'choice', question: '?' }), /choix-requis/);
  const qid = await questions.askQuestion(db, {
    projectId: pid, kind: 'choice', question: 'Continuer sans tests ?',
    options: ['oui', 'non'], defaultChoice: 'non',
    deadlineAt: new Date(Date.now() + 3600000).toISOString()
  });
  assert.strictEqual((await questions.openQuestions(db, pid)).length, 1);

  // Réponse hors choix refusée ; réponse valide réveille via user_reply.
  await assert.rejects(questions.answerQuestion(db, { id: qid, answer: 'peut-etre' }), /reponse-hors-choix/);
  const answered = await questions.answerQuestion(db, { id: qid, answer: 'non' });
  assert.deepStrictEqual(answered, { id: qid, status: 'answered', answer: 'non' });
  assert.strictEqual(questions.resolutionOf(await questions.getQuestion(db, qid)), 'non');
  const events = await inbox.listPendingEvents(db, pid);
  assert.ok(events.some((event) => event.type === 'user_reply'));
  await assert.rejects(questions.answerQuestion(db, { id: qid, answer: 'oui' }), /question-answered/);

  // Échéance : expirée, défaut appliqué à la résolution.
  const late = await questions.askQuestion(db, {
    projectId: pid, kind: 'confirm', question: 'Déployer ?',
    defaultChoice: 'non', deadlineAt: new Date(Date.now() - 1000).toISOString()
  });
  const expired = await questions.expireDue(db, { projectId: pid });
  assert.deepStrictEqual(expired, [late]);
  assert.strictEqual(questions.resolutionOf(await questions.getQuestion(db, late)), 'non');
  assert.strictEqual((await questions.openQuestions(db, pid)).length, 0);

  console.log('ontogenesis questions checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });

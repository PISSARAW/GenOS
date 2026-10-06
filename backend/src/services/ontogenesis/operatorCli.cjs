'use strict';

const operator = require('./operatorService');
const store = require('./projectStore');
const inbox = require('./inboxService');
const notifications = require('./notificationService');

function projectId(options) {
  if (typeof options.project !== 'string' || !options.project) throw new Error('--project requis');
  return options.project;
}

function jsonList(value) {
  return value === undefined ? [] : JSON.parse(value);
}

async function task(db, options) {
  const id = await operator.addOperatorTask(db, { projectId: projectId(options), title: options.title,
    priority: Number(options.priority ?? 0), dependsOn: jsonList(options.depends), acceptance: jsonList(options.acceptance) });
  console.log(JSON.stringify({ taskId: id }));
}

async function tasks(db, options) {
  const id = projectId(options);
  await operator.requireProject(db, id);
  console.log(JSON.stringify(await store.listTasks(db, id), null, 2));
}

async function message(db, options) {
  console.log(JSON.stringify({ inboxId: await operator.sendMessage(db, { projectId: projectId(options), body: options.body }) }));
}

async function priority(db, options) {
  console.log(JSON.stringify({ inboxId: await operator.reprioritize(db, { projectId: projectId(options),
    taskId: options.task, priority: Number(options.priority) }) }));
}

async function budgets(db, options) {
  const result = await operator.reviseBudgets(db, { projectId: projectId(options), reason: options.reason,
    budgets: { tokens: Number(options.tokens), usd: Number(options.usd), seconds: Number(options.seconds) } });
  console.log(JSON.stringify(result));
}

async function event(db, options) {
  const id = projectId(options);
  await operator.requireProject(db, id);
  const types = ['git', 'worker_done', 'resource', 'deadline', 'user_reply', 'wake'];
  if (!types.includes(options.type)) throw new Error('evenement-inconnu');
  const result = await inbox.postEvent(db, { projectId: id, type: options.type,
    payload: options.payload ? JSON.parse(options.payload) : {} });
  console.log(JSON.stringify({ eventId: result }));
}

async function notes(db, options) {
  const id = projectId(options);
  await operator.requireProject(db, id);
  console.log(JSON.stringify(await notifications.listPendingNotifications(db, id), null, 2));
}

async function ack(db, options) {
  const id = projectId(options);
  const row = await db.get('SELECT id FROM ontogenesis_notifications WHERE id = ? AND project_id = ?', [options.notification, id]);
  if (!row) throw new Error('notification-introuvable');
  await notifications.markNotified(db, row.id, 'acked');
  console.log(JSON.stringify({ acknowledged: row.id }));
}

module.exports = { task, tasks, message, priority, budgets, event, notifications: notes, ack };

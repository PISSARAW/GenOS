'use strict';

// Memory mission sealing (ADR 0280). Pure helpers: tag records with their
// mission scope at write time, and refuse foreign-mission records at read
// time when the caller declares a scope. No scope declared = unchanged
// behavior. No schema migration: the tag is content-encoded (same precedent
// as the unverified TTL stamp in agentMemoryStore).

const SCOPE_MARKER = '[MISSION_SCOPE';
const LONG_TASK_CHARS = 120;

function cleanToken(value) {
  return String(value || '').replace(/[\[\]\r\n]/g, '').trim().slice(0, 120);
}

function scopeOf(value) {
  if (!value || typeof value !== 'object') return null;
  const missionId = cleanToken(value.missionId || value.mission_id);
  if (!missionId) return null;
  const chamber = cleanToken(value.chamber);
  return chamber ? { missionId, chamber } : { missionId };
}

function tagFor(scope) {
  const checked = scopeOf(scope);
  if (!checked) return '';
  const chamber = checked.chamber ? ` chamber=${checked.chamber}` : '';
  return `\n[MISSION_SCOPE id=${checked.missionId}${chamber}]`;
}

function scopeTagOf(text) {
  const match = String(text || '').match(/\[MISSION_SCOPE id=([^\s\]]+)/);
  return match ? match[1] : null;
}

function chamberTagOf(text) {
  const match = String(text || '').match(/\[MISSION_SCOPE id=[^\s\]]+ chamber=([^\s\]]+)\]/);
  return match ? match[1] : null;
}

function normalizeTask(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function embeddedTask(text) {
  const match = String(text || '').match(/Task:(.+?)(?:\nResult:|$)/s);
  if (!match) return null;
  return normalizeTask(match[1]);
}

function itemText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  return item.summary || item.content || item.observationOutput || item.actionInput || item.title || '';
}

function foreignTask(text, task) {
  const embedded = embeddedTask(text);
  const current = normalizeTask(task);
  if (!embedded || embedded.length < LONG_TASK_CHARS) return false;
  if (!current || current.length < LONG_TASK_CHARS) return false;
  return embedded !== current;
}

function keepForScope(text, scope, task) {
  const checked = scopeOf(scope);
  const tag = scopeTagOf(text);
  if (tag) {
    const chamber = chamberTagOf(text);
    return Boolean(checked) && tag === checked.missionId && (!chamber || chamber === checked.chamber);
  }
  return !foreignTask(text, task);
}

function filterScoped(items, scope, task) {
  return (Array.isArray(items) ? items : []).filter((item) => keepForScope(itemText(item), scope, task));
}

module.exports = {
  scopeOf,
  tagFor,
  scopeTagOf,
  embeddedTask,
  keepForScope,
  filterScoped
};

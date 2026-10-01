'use strict';

const crypto = require('crypto');

/**
 * Canaux et routage des retours (roadmap §P6).
 * Le même projet reste joignable sur plusieurs canaux sans
 * réinitialiser sa mémoire : les messages restent par canal, le
 * contexte est partagé via la persistance. Routage sobre : les
 * décisions partent partout où c'est activé, la routine reste
 * sur le canal local.
 */

const CHANNELS = ['cli', 'slack', 'teams', 'voice', 'webhook'];
const DIRECTIONS = ['in', 'out'];

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function checkChannel(input) {
  if (!CHANNELS.includes(input.channel)) throw new Error('canal-inconnu');
  if (!DIRECTIONS.includes(input.direction)) throw new Error('direction-inconnue');
}

async function registerChannel(db, input) {
  checkChannel(input);
  const id = input.id || newId('chan');
  await db.run(
    `INSERT INTO ontogenesis_channels (id, project_id, channel, direction, enabled, config_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, channel, direction)
     DO UPDATE SET enabled = ?, config_json = ?`,
    [id, input.projectId, input.channel, input.direction, input.enabled === false ? 0 : 1,
      JSON.stringify(input.config || {}), input.enabled === false ? 0 : 1, JSON.stringify(input.config || {})]
  );
  return id;
}

async function listChannels(db, projectId, direction) {
  if (direction) {
    return db.all(
      `SELECT * FROM ontogenesis_channels WHERE project_id = ? AND direction = ? ORDER BY channel ASC`,
      [projectId, direction]
    );
  }
  return db.all(
    `SELECT * FROM ontogenesis_channels WHERE project_id = ? ORDER BY channel ASC`,
    [projectId]
  );
}

function enabledOut(channels) {
  return (channels || []).filter((row) => row.direction === 'out' && row.enabled).map((row) => row.channel);
}

function routesFor(kind, channels) {
  const out = enabledOut(channels);
  if (out.length === 0) return [];
  if (kind === 'decision_needed') return out;
  if (out.includes('cli')) return ['cli'];
  return [out[0]];
}

async function dispatchRoutes(db, input) {
  const channels = await listChannels(db, input.projectId, 'out');
  return { kind: input.kind, routes: routesFor(input.kind, channels) };
}

module.exports = { CHANNELS, DIRECTIONS, registerChannel, listChannels, routesFor, dispatchRoutes };

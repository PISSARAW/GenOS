'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { withTransaction } = require('../../../db');

function invalid(message, code = 'METAPOPULATION_CULTURE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cultureHash(culture) {
  return createHash('sha256').update(stableJson(culture)).digest('hex');
}

function validCulture(culture) {
  return culture && typeof culture.id === 'string' && culture.id.trim()
    && Number.isSafeInteger(culture.version) && culture.version > 0
    && Array.isArray(culture.parentRefs);
}

function fromRow(row) {
  if (!row) return null;
  return {
    cultureId: row.culture_id, metapopulationId: row.metapopulation_id,
    version: row.culture_version, parentCultureId: row.parent_culture_id,
    payloadType: row.payload_type, payloadRef: row.payload_ref, author: row.author,
    contentHash: row.content_hash, content: JSON.parse(row.content_json),
    registeredAt: row.registered_at, transmissionCount: row.transmission_count
  };
}

async function getCulture(input) {
  const row = await input.db.get(`SELECT * FROM metapopulation_cultures
    WHERE metapopulation_id = ? AND culture_id = ?`, input.metapopulationId, input.cultureId);
  return fromRow(row);
}

async function assertParentCulture(db, metapopulationId, parentCultureId) {
  if (!parentCultureId) return;
  const parent = await getCulture({ db, metapopulationId, cultureId: parentCultureId });
  if (!parent) throw invalid('Culture parent is absent from the session.', 'METAPOPULATION_CULTURE_PARENT_MISSING');
}

async function registerCulture(input) {
  const { db, metapopulationId, culture, author = 'unknown' } = input;
  if (!db || !metapopulationId || !validCulture(culture)) throw invalid('A versioned culture and persistent session are required.');
  const content = JSON.parse(JSON.stringify(culture));
  const hash = cultureHash(content);
  const existing = await getCulture({ db, metapopulationId, cultureId: culture.id });
  if (existing) {
    if (existing.contentHash !== hash) throw invalid('Culture IDs are immutable.', 'METAPOPULATION_CULTURE_CONFLICT');
    return existing;
  }
  const parentCultureId = culture.parentCultureId || null;
  await assertParentCulture(db, metapopulationId, parentCultureId);
  await db.run(`INSERT INTO metapopulation_cultures
    (culture_id, metapopulation_id, culture_version, parent_culture_id, payload_type,
     payload_ref, author, content_hash, content_json, registered_at, transmission_count, immutable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
  culture.id, metapopulationId, culture.version, parentCultureId,
  culture.payloadType || 'PROCEDURE', culture.payloadRef || culture.id,
  author, hash, JSON.stringify(content), new Date().toISOString());
  return getCulture({ db, metapopulationId, cultureId: culture.id });
}

async function residentDeme(input) {
  const row = await input.db.get(`SELECT status FROM metapopulation_demes
    WHERE metapopulation_id = ? AND deme_id = ?`, input.metapopulationId, input.demeId);
  return row && ['ACTIVE', 'STRESSED', 'ESTABLISHING'].includes(row.status);
}

async function transmitCulture(input) {
  const { db, metapopulationId, cultureId, sourceDemeId, targetDemeId } = input;
  const culture = await getCulture({ db, metapopulationId, cultureId });
  if (!culture) return { transmitted: false, reason: 'CULTURE_NOT_FOUND' };
  if (sourceDemeId === targetDemeId || input.compatible !== true) {
    return { transmitted: false, reason: 'TRANSFER_NOT_ATTESTED' };
  }
  const sourceResident = await residentDeme({ db, metapopulationId, demeId: sourceDemeId });
  const targetResident = await residentDeme({ db, metapopulationId, demeId: targetDemeId });
  if (!sourceResident || !targetResident) return { transmitted: false, reason: 'DEME_NOT_RESIDENT' };
  const transmissionId = `tx-${randomUUID()}`;
  await withTransaction(db, async (tx) => {
    await tx.run(`INSERT INTO culture_transmissions
      (transmission_id, metapopulation_id, culture_id, source_deme_id, target_deme_id,
       mode, transmitted_at, compatible, source_resident, target_resident)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
    transmissionId, metapopulationId, cultureId, sourceDemeId, targetDemeId,
    input.mode || 'horizontal', new Date().toISOString());
    await tx.run(`UPDATE metapopulation_cultures SET transmission_count = transmission_count + 1
      WHERE metapopulation_id = ? AND culture_id = ?`, metapopulationId, cultureId);
  });
  return { transmitted: true, transmissionId, cultureId, sourceDemeId, targetDemeId };
}

async function mutateCulture(input) {
  const { db, metapopulationId, cultureId, mutation, mutatorId = 'regional-runtime' } = input;
  const parent = await getCulture({ db, metapopulationId, cultureId });
  if (!parent) return { mutated: false, reason: 'CULTURE_NOT_FOUND' };
  if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) throw invalid('Mutation must be an object.');
  const rootId = parent.content.rootCultureId || parent.cultureId;
  const version = parent.version + 1;
  const nextId = `${rootId}-v${version}`;
  const content = { ...parent.content, ...mutation, id: nextId, rootCultureId: rootId,
    version, parentCultureId: parent.cultureId,
    parentRefs: [...new Set([...(parent.content.parentRefs || []), parent.cultureId])],
    lastMutator: mutatorId };
  const child = await registerCulture({ db, metapopulationId, culture: content, author: mutatorId });
  return { mutated: true, cultureId: child.cultureId, parentCultureId: parent.cultureId,
    newVersion: child.version, contentHash: child.contentHash };
}

async function buildCulturalPhylogeny(input) {
  const rows = await input.db.all(`SELECT culture_id, culture_version, parent_culture_id
    FROM metapopulation_cultures WHERE metapopulation_id = ? ORDER BY culture_id`, input.metapopulationId);
  const nodes = rows.map((row) => ({ cultureId: row.culture_id, version: row.culture_version,
    parents: row.parent_culture_id ? [row.parent_culture_id] : [], children: [], depth: 0 }));
  const byId = new Map(nodes.map((node) => [node.cultureId, node]));
  for (const node of nodes) {
    for (const parentId of node.parents) {
      const parent = byId.get(parentId);
      if (parent) parent.children.push(node.cultureId);
    }
  }
  for (const node of nodes) {
    let parent = byId.get(node.parents[0]);
    const seen = new Set([node.cultureId]);
    while (parent && !seen.has(parent.cultureId)) {
      seen.add(parent.cultureId);
      node.depth += 1;
      parent = byId.get(parent.parents[0]);
    }
  }
  return { roots: nodes.filter((node) => !node.parents.length).map((node) => node.cultureId),
    nodes, count: nodes.length };
}

async function cultureProvenance(input) {
  const culture = await getCulture(input);
  return culture && { cultureId: culture.cultureId, version: culture.version,
    author: culture.author, parentCultureId: culture.parentCultureId,
    firstRegistered: culture.registeredAt, transmissionCount: culture.transmissionCount };
}

async function verifyResidentDuringTransfer(input) {
  const rows = await input.db.all(`SELECT source_resident, target_resident
    FROM culture_transmissions WHERE metapopulation_id = ? AND culture_id = ?`,
  input.metapopulationId, input.cultureId);
  return rows.length > 0 && rows.every((row) => row.source_resident === 1 && row.target_resident === 1);
}

module.exports = { registerCulture, getCulture, transmitCulture, mutateCulture,
  buildCulturalPhylogeny, cultureProvenance, verifyResidentDuringTransfer };

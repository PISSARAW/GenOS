/**
 * GenOS Fossilisation stratigraphique
 * Archive terminale, immuable et irréversible d'une lignée d'agent.
 * Un fossile est une preuve : il s'excave en lecture seule et n'est jamais
 * ressuscitable (cf. docs/01-concepts/fossilisation.md et ADR 0003).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MODES = ['petrification', 'external_mold', 'internal_mold', 'trace'];
const DEFAULT_MODE = 'petrification';
const DEFAULT_QUALITY = 1.0;

const MODE_ALIASES = {
  'external-mold': 'external_mold',
  moule_externe: 'external_mold',
  'internal-mold': 'internal_mold',
  moule_interne: 'internal_mold',
  ichnofossil: 'trace',
  trace_fossile: 'trace'
};

function normalizeMode(label) {
  const value = String(label || '').trim().toLowerCase();
  if (MODES.includes(value)) return value;
  return MODE_ALIASES[value] || DEFAULT_MODE;
}

function conservationQuality(hardParts, softParts) {
  const hard = Array.isArray(hardParts) ? hardParts.length : 0;
  const soft = Array.isArray(softParts) ? softParts.length : 0;
  const total = hard + soft;
  return total === 0 ? DEFAULT_QUALITY : hard / total;
}

// JSON canonique stable : clés triées récursivement, aligné sur serde_json (BTreeMap).
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const body = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${body.join(',')}}`;
}

function mineralMaterial(record) {
  return {
    lineage_id: record.extinct_lineage_id,
    reason: record.reason,
    recorded_at: record.recorded_at,
    mode: record.mode,
    hard_parts: record.hard_parts || [],
    soft_parts_lost: record.soft_parts_lost || [],
    phenotype_markers: record.phenotype_markers || [],
    mineral_payload: record.mineral_payload === undefined ? null : record.mineral_payload
  };
}

function computePayloadHash(record) {
  return crypto.createHash('sha256').update(stableStringify(mineralMaterial(record))).digest('hex');
}

function verifyFossilIntegrity(record) {
  if (!record || !record.payload_hash) return false;
  return record.payload_hash === computePayloadHash(record);
}

function stratumOf(recordedAt) {
  const day = String(recordedAt || '').split('T')[0].trim();
  return day ? `stratum-${day}` : 'stratum-unknown';
}

function decodePhenotype(markers) {
  const list = Array.isArray(markers) ? markers : [];
  const favorable = list.filter((marker) => marker && marker.shape === 'elongated').length;
  const adverse = list.filter((marker) => marker && marker.shape === 'spherical').length;
  const total = favorable + adverse;
  if (total === 0) {
    return { inferred_class: 'neutral', favorable_markers: 0, adverse_markers: 0, confidence: 0 };
  }
  if (favorable >= adverse) {
    return {
      inferred_class: 'safe_success',
      favorable_markers: favorable,
      adverse_markers: adverse,
      confidence: favorable / total
    };
  }
  return {
    inferred_class: 'risky_failure',
    favorable_markers: favorable,
    adverse_markers: adverse,
    confidence: adverse / total
  };
}

function coalesce(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildFossilRecord(input = {}) {
  const lineageId = coalesce(input.lineageId, input.lineage_id);
  if (!lineageId) throw new Error('lineageId required for fossilization');
  const recordedAt = coalesce(input.recordedAt, new Date().toISOString());
  const record = {
    fossil_id: coalesce(input.fossilId, crypto.randomUUID()),
    extinct_lineage_id: String(lineageId),
    reason: coalesce(input.reason, 'Stratigraphic extinction event'),
    recorded_at: recordedAt,
    mode: normalizeMode(input.mode),
    stratum_id: coalesce(input.stratumId, stratumOf(recordedAt)),
    hard_parts: asArray(input.hardParts),
    soft_parts_lost: asArray(input.softPartsLost),
    phenotype_markers: asArray(input.phenotypeMarkers),
    mineral_payload: input.mineralPayload === undefined ? null : input.mineralPayload,
    organization_id: coalesce(input.organizationId, input.organization_id, null),
    project_id: coalesce(input.projectId, input.project_id, null)
  };
  record.conservation_quality = conservationQuality(record.hard_parts, record.soft_parts_lost);
  record.payload_hash = computePayloadHash(record);
  return record;
}

async function persistFossil(db, record) {
  await db.run(
    `INSERT INTO fossils
     (fossil_id, extinct_lineage_id, reason, mode, stratum_id, payload_hash,
      conservation_quality, hard_parts_json, soft_parts_lost_json,
      phenotype_markers_json, mineral_payload_json, organization_id, project_id, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.fossil_id,
    record.extinct_lineage_id,
    record.reason,
    record.mode,
    record.stratum_id,
    record.payload_hash,
    record.conservation_quality,
    JSON.stringify(record.hard_parts || []),
    JSON.stringify(record.soft_parts_lost || []),
    JSON.stringify(record.phenotype_markers || []),
    record.mineral_payload === null || record.mineral_payload === undefined
      ? null
      : JSON.stringify(record.mineral_payload),
    record.organization_id || null,
    record.project_id || null,
    record.recorded_at
  );
  await db.run(
    `INSERT INTO fossil_strata (stratum_id, deposited_at, fossil_count, organization_id, project_id)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(stratum_id) DO UPDATE SET fossil_count = fossil_count + 1`,
    record.stratum_id,
    record.recorded_at,
    record.organization_id || null,
    record.project_id || null
  );
  return record;
}

function fossilArtifactDir() {
  const { studioBridgeRoot } = require('./genosCliEnv');
  return path.join(studioBridgeRoot(), 'fossils');
}

/**
 * Écrit l'artefact stratigraphique que le CLI (`genos fossil ...`) sait relire.
 * Le hash JS étant canonique (clés triées), l'artefact est vérifiable côté Rust.
 */
function writeFossilArtifact(record) {
  const dir = fossilArtifactDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.extinct_lineage_id}_${record.fossil_id}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...record, stratum: 'STRATIGRAPHIC_FOSSIL' }, null, 2));
  return file;
}

/**
 * Enfouit puis indexe un fossile. L'écriture est terminale : aucune API de
 * résurrection n'est exposée.
 */
async function recordFossil(input = {}, db, options = {}) {
  const lineageId = input.lineageId || input.lineage_id;
  if (!lineageId) {
    return { success: false, error: 'lineageId required for fossilization' };
  }
  const record = buildFossilRecord(input);
  if (db) await persistFossil(db, record);
  if (options.writeArtifact !== false && process.env.GENOS_FOSSIL_ARTIFACT !== '0') {
    try {
      writeFossilArtifact(record);
    } catch (_) { /* l'artefact opérateur est best-effort, l'index DB prime */ }
  }
  return { success: true, indexed: Boolean(db), fossil: record };
}

function scopeClauses(scope = {}, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const clauses = [];
  const params = [];
  const organizationId = scope.organizationId || scope.organization_id;
  const projectId = scope.projectId || scope.project_id;
  if (organizationId) {
    clauses.push(`${prefix}organization_id = ?`);
    params.push(organizationId);
  }
  if (projectId) {
    clauses.push(`${prefix}project_id = ?`);
    params.push(projectId);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function fossilFromRow(row) {
  return {
    fossil_id: row.fossil_id,
    extinct_lineage_id: row.extinct_lineage_id,
    reason: row.reason,
    mode: row.mode,
    stratum_id: row.stratum_id,
    payload_hash: row.payload_hash,
    conservation_quality: row.conservation_quality,
    hard_parts: parseJson(row.hard_parts_json, []),
    soft_parts_lost: parseJson(row.soft_parts_lost_json, []),
    phenotype_markers: parseJson(row.phenotype_markers_json, []),
    mineral_payload: row.mineral_payload_json ? parseJson(row.mineral_payload_json, null) : null,
    recorded_at: row.recorded_at
  };
}

async function listFossils(db, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 200;
  const scope = scopeClauses(options, 'f');
  const rows = await db.all(`SELECT f.* FROM fossils f${scope.sql} ORDER BY f.recorded_at DESC LIMIT ?`, ...scope.params, limit);
  return rows.map(fossilFromRow);
}

async function listStrata(db, options = {}) {
  const scope = scopeClauses(options, 'f');
  return db.all(
    `SELECT f.stratum_id, MIN(f.recorded_at) AS deposited_at,
            COUNT(*) AS fossil_count, COUNT(*) AS indexed_count
       FROM fossils f${scope.sql}
      GROUP BY f.stratum_id
      ORDER BY deposited_at DESC`,
    ...scope.params
  );
}

/** Décode les mélanosomes d'un fossile (phénotype résiduel), en lecture seule. */
async function decodeFossil(db, fossilId, options = {}) {
  const scope = scopeClauses(options);
  const row = await db.get(`SELECT * FROM fossils WHERE fossil_id = ?${scope.sql ? scope.sql.replace(' WHERE ', ' AND ') : ''}`, fossilId, ...scope.params);
  if (!row) return { success: false, error: 'Fossil not found in stratigraphic registry.' };
  const record = fossilFromRow(row);
  return {
    success: true,
    read_only: true,
    fossil_id: record.fossil_id,
    extinct_lineage_id: record.extinct_lineage_id,
    reading: decodePhenotype(record.phenotype_markers),
    phenotype_markers: record.phenotype_markers
  };
}

/** Excavation en lecture seule : jamais de promotion ni de résurrection. */
async function excavateFossil(db, fossilId, options = {}) {
  const scope = scopeClauses(options);
  const row = await db.get(`SELECT * FROM fossils WHERE fossil_id = ?${scope.sql ? scope.sql.replace(' WHERE ', ' AND ') : ''}`, fossilId, ...scope.params);
  if (!row) return { success: false, error: 'Fossil not found in stratigraphic registry.' };
  const record = fossilFromRow(row);
  return {
    success: true,
    read_only: true,
    resurrection: 'forbidden',
    integrity_verified: verifyFossilIntegrity(record),
    reading: decodePhenotype(record.phenotype_markers),
    specimen: record
  };
}

module.exports = {
  MODES,
  DEFAULT_MODE,
  normalizeMode,
  conservationQuality,
  stableStringify,
  mineralMaterial,
  computePayloadHash,
  verifyFossilIntegrity,
  stratumOf,
  decodePhenotype,
  buildFossilRecord,
  persistFossil,
  writeFossilArtifact,
  recordFossil,
  scopeClauses,
  listFossils,
  listStrata,
  excavateFossil,
  decodeFossil
};

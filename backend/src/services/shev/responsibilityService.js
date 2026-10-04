'use strict';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validDimension(dimension, names) {
  return dimension && nonEmpty(dimension.name) && nonEmpty(dimension.expected)
    && Array.isArray(dimension.acceptance) && dimension.acceptance.length > 0
    && dimension.acceptance.every(nonEmpty) && !names.has(dimension.name);
}

function validateDimensions(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new TypeError('SHEV mandate requires dimensions.');
  }
  const names = new Set();
  for (const dimension of dimensions) {
    if (!validDimension(dimension, names)) throw new TypeError('SHEV mandate dimension is invalid or duplicated.');
    names.add(dimension.name);
  }
}

function validateMandate(mandate) {
  if (!mandate || !nonEmpty(mandate.purpose)) throw new TypeError('SHEV mandate requires a purpose.');
  validateDimensions(mandate.dimensions);
  if (typeof mandate.autoDiagnose !== 'boolean' || typeof mandate.autoInstrument !== 'boolean') {
    throw new TypeError('SHEV automatic initiative permissions must be explicit.');
  }
  return { purpose: mandate.purpose, dimensions: mandate.dimensions.map((dimension) => ({
    name: dimension.name, expected: dimension.expected, acceptance: [...dimension.acceptance]
  })),
    autoDiagnose: mandate.autoDiagnose, autoInstrument: mandate.autoInstrument };
}

async function registerResponsibility(db, input) {
  if (!nonEmpty(input?.projectId) || !nonEmpty(input.authorityRef)) {
    throw new TypeError('SHEV requires a project and delegation authority reference.');
  }
  const mandate = validateMandate(input.mandate);
  const project = await db.get('SELECT id FROM ontogenesis_projects WHERE id = ?', [input.projectId]);
  if (!project) throw new Error('SHEV project does not exist.');
  const existing = await db.get('SELECT * FROM shev_responsibilities WHERE project_id = ?', [input.projectId]);
  if (existing) throw new Error('SHEV responsibility already exists; mandate cannot be silently replaced.');
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.run('INSERT INTO shev_responsibilities (project_id) VALUES (?)', [input.projectId]);
    await db.run(`INSERT INTO shev_mandates (project_id, version, mandate_json, authority_ref)
      VALUES (?, 1, ?, ?)`, [input.projectId, JSON.stringify(mandate), input.authorityRef]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return getResponsibility(db, input.projectId);
}

async function getResponsibility(db, projectId) {
  const row = await db.get(`SELECT r.project_id, r.status, r.mandate_version, m.mandate_json, m.authority_ref
    FROM shev_responsibilities r JOIN shev_mandates m
      ON m.project_id = r.project_id AND m.version = r.mandate_version
    WHERE r.project_id = ?`, [projectId]);
  if (!row) return null;
  return { projectId: row.project_id, status: row.status, mandateVersion: row.mandate_version,
    mandate: JSON.parse(row.mandate_json), authorityRef: row.authority_ref };
}

module.exports = { registerResponsibility, getResponsibility, validateMandate };

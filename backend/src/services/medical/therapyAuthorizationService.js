'use strict';
const crypto = require('node:crypto');
const FIELDS = ['authorization_id','mission_id','cell_id','genome_id','genome_fingerprint',
  'cell_state_digest','source_receipt_id','therapy_json','approver_id','expires_at_unix_ms'];
function signAuthorization(auth) {
  const secret = process.env.GENOS_THERAPY_AUTH_SECRET;
  if (!secret?.trim()) throw new Error('Therapy authority unavailable');
  return crypto.createHmac('sha256',secret).update(['genos.therapy-authorization/v1',...FIELDS.map(field => String(auth[field]))].join('\0')).digest('hex');
}
function requireApprover(input) {
  if (input.approved !== true || !input.actor?.isAuthenticated || !input.actor.permissions?.includes('all')) {
    throw Object.assign(new Error('Explicit authorized therapy approval required'), { code: 'THERAPY_AUTHORIZATION_REQUIRED' });
  }
}
async function issueAuthorization(db,input) {
  requireApprover(input);
  const cell = await db.get(`SELECT * FROM rust_cell_registry WHERE mission_id=? AND cell_id=?`,input.missionId,input.cellId);
  if (!cell?.genome_id || !cell.genome_fingerprint) throw new Error('Durable clinical cell not found');
  const latest = await db.get(`SELECT MAX(tick) AS tick FROM rust_cell_registry WHERE mission_id=?`,input.missionId);
  if (cell.tick !== latest.tick) throw new Error('Clinical cell is not in the current population');
  const therapy = JSON.stringify(input.therapy);
  if (!therapy || therapy === 'null') throw new Error('Therapy required');
  const auth = { authorization_id: crypto.randomUUID(), mission_id: input.missionId, cell_id: input.cellId,
    genome_id: cell.genome_id, genome_fingerprint: cell.genome_fingerprint,
    cell_state_digest: crypto.createHash('sha256').update(cell.cell_state_json).digest('hex'),
    source_receipt_id: cell.source_receipt_id, therapy_json: therapy,
    approver_id: input.actor.keyId || input.actor.username, expires_at_unix_ms: Date.now()+60000 };
  if (!auth.approver_id) throw new Error('Approver identity required');
  return { ...auth,signature: signAuthorization(auth) };
}
function authorizeClinicalMutation(agentId,options) {
  const approval = options?.authorization;
  if (!approval || approval.approved !== true || approval.targetAgentId !== agentId
      || !approval.approverId || !approval.authorizationId || approval.expiresAt <= Date.now()) {
    throw Object.assign(new Error('Explicit clinical mutation authorization required'), { code: 'THERAPY_AUTHORIZATION_REQUIRED' });
  }
  const expected = clinicalSignature(approval);
  const actual = Buffer.from(String(approval.signature || ''),'hex');
  const bytes = Buffer.from(expected,'hex');
  if (actual.length !== bytes.length || !crypto.timingSafeEqual(actual,bytes)) throw new Error('Clinical authorization signature invalid');
}
function clinicalSignature(auth) {
  const secret = process.env.GENOS_THERAPY_AUTH_SECRET;
  if (!secret?.trim()) throw new Error('Therapy authority unavailable');
  const payload = ['node-clinical/v1',auth.authorizationId,auth.targetAgentId,auth.approverId,auth.therapyType,auth.expiresAt].join('\0');
  return crypto.createHmac('sha256',secret).update(payload).digest('hex');
}
module.exports = { issueAuthorization,signAuthorization,authorizeClinicalMutation,clinicalSignature };

'use strict';

const { error } = require('./garageRequests');

async function assertReservation(db, request) {
  if (request.garageRequestId) {
    const claim = await db.get(`SELECT request_id FROM garage_queue WHERE request_id = ?
      AND lease_id = ? AND worker_id = ? AND status = 'claimed' AND phase = 'ready'
      AND julianday(lease_expires_at) > julianday('now')`, request.garageRequestId,
    request.garageLeaseId, request.workerId);
    if (!claim) throw error('GARAGE_STALE_CLAIM', 'No current claim authorizes the reservation.');
    return;
  }
  const pending = await db.get(`SELECT request_id FROM garage_queue WHERE worker_id = ?
    AND status IN ('queued','claimed','running') LIMIT 1`, request.workerId);
  if (pending) throw error('WORKER_RESERVED_BY_QUEUE', 'Worker identity belongs to a durable garage request.');
}

module.exports = { assertReservation };

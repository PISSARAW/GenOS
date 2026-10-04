'use strict';

const { publishGuardedReferences } = require('./executionBoundary');

function error(res, input) {
  const { status, code, message, details } = input;
  const payload = { error: { code, message } };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
}

function transportInputValid(args) {
  const data = args?.signal_data;
  const emptyData = data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).length === 0;
  return Boolean(args?.signal_type === 'ligand' && emptyData
    && !args.topic && !args.orchestrator_id);
}

function validInput(scope, args) {
  return Boolean(scope?.organizationId && scope?.projectId
    && args?.relational && typeof args.relational === 'object'
    && transportInputValid(args));
}

async function executeRelationalTransport(input) {
  const { res, db, args, agentId, scope } = input;
  if (!validInput(scope, args)) {
    return error(res, { status: 400, code: 'RPE_INVALID_TRANSPORT',
      message: 'Relational signals require a tenant scope, ligand, empty signal_data and relational request.' });
  }
  try {
    const result = await publishGuardedReferences({
      db, scope, actorId: agentId, communication: args.relational
    });
    if (result.status === 'denied') {
      return error(res, { status: 403, code: 'RPE_DENIED',
        message: result.decision.reasonCodes.join(', '), details: result.decision });
    }
    return res.status(200).json({ configured: true, success: true,
      status: result.status, published: result.status === 'executed',
      signalId: result.result?.signalId || null, decision: result.decision });
  } catch (failure) {
    return error(res, { status: 503, code: failure.code || 'RPE_EXECUTION_FAILED',
      message: failure.message });
  }
}

module.exports = { executeRelationalTransport };

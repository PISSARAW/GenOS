/**
 * GenOS swarm quorum input adapters (swarmController delegation module).
 *
 * Keeps backward compatibility for both call shapes:
 * - object form: { yesCount|yesVal, noCount|noVal, totalVotes|totalVal,
 *   activeNodeCount|activeCount, approvalThreshold|quorumThreshold }
 * - positional form: (yes, no, total, active, threshold)
 * The default approval threshold is the shared DEFAULT_THRESHOLD (0.5).
 */
const qp = require('../services/primitiveHandlers/quorumPolicy');

function pickNumber(spec, first, second) {
  const direct = Number(spec[first]);
  if (Number.isFinite(direct)) return direct;
  const alternate = Number(spec[second]);
  if (Number.isFinite(alternate)) return alternate;
  return 0;
}

function pickParticipation(spec) {
  const votes = Number(spec.totalVotes);
  if (Number.isFinite(votes)) return votes;
  const val = Number(spec.totalVal);
  if (Number.isFinite(val)) return val;
  const part = Number(spec.participationCount);
  if (Number.isFinite(part)) return part;
  return 0;
}

function pickThreshold(spec) {
  const direct = Number(spec.approvalThreshold);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const alternate = Number(spec.quorumThreshold);
  if (Number.isFinite(alternate) && alternate > 0) return alternate;
  return qp.DEFAULT_THRESHOLD;
}

function fromObjectSpec(spec) {
  return {
    yes: pickNumber(spec, 'yesCount', 'yesVal'),
    no: pickNumber(spec, 'noCount', 'noVal'),
    participation: pickParticipation(spec),
    active: pickNumber(spec, 'activeNodeCount', 'activeCount'),
    threshold: pickThreshold(spec)
  };
}

function thresholdOfPositional(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return qp.DEFAULT_THRESHOLD;
}

function fromPositional(args) {
  return {
    yes: qp.countOf(args[0]),
    no: qp.countOf(args[1]),
    participation: qp.countOf(args[2]),
    active: qp.countOf(args[3]),
    threshold: thresholdOfPositional(args[4])
  };
}

function normalizeQuorumInput(args) {
  const first = args[0];
  if (first !== null && typeof first === 'object') return fromObjectSpec(first);
  return fromPositional(args);
}

function quorumMetFromArgs(args) {
  const spec = normalizeQuorumInput(args);
  return qp.quorumMetCanonical(spec);
}

function rejectedFromArgs(args) {
  const spec = normalizeQuorumInput(args);
  return qp.rejectionCanonical(spec);
}

module.exports = {
  normalizeQuorumInput,
  quorumMetFromArgs,
  rejectedFromArgs
};

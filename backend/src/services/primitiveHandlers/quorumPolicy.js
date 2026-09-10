/**
 * GenOS shared quorum policy (collectiveConsensus + swarmController).
 *
 * Single source of truth for the quorum defaults:
 * - DEFAULT_THRESHOLD = 0.5: approval of the top option must reach it.
 * - EPSILON = 1e-9: shared by simple and weighted tallies, no lexical tie-break.
 * - Participation: explicit minVotes/minParticipation win; otherwise the floor
 *   is max(2, ceil(activeCount * 0.5)) when activeCount is known, else 2, so a
 *   single vote never reaches quorum by default.
 * - Abstentions are excluded from approval totals everywhere; participation
 *   (abstentions included) travels separately as participationCount.
 * - Brier weight is continuous: weight = (1 - brier)^2 for brier in [0, 1].
 */

const DEFAULT_THRESHOLD = 0.5;
const EPSILON = 1e-9;
const PARTICIPATION_RATIO = 0.5;
const MIN_VOTERS_FLOOR = 2;

function isAbstentionText(text) {
  if (text === undefined || text === null) return false;
  return String(text).trim().toLowerCase() === 'abstain';
}

function normalizeVoteText(vote) {
  if (vote === undefined || vote === null) return '';
  return String(vote).trim();
}

function voteTextForIssue(payload, issue) {
  if (payload === null || typeof payload !== 'object') return null;
  if (payload.issue !== issue) return null;
  const raw = payload.vote;
  if (raw === undefined || raw === null) return null;
  const text = normalizeVoteText(raw);
  if (text === '') return null;
  return text;
}

function brierScoreToWeight(brier) {
  if (!Number.isFinite(brier) || brier <= 0) return 1.0;
  if (brier >= 1) return 0.0;
  const keep = 1 - brier;
  return keep * keep;
}

function countOf(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return 0;
}

function probTotal(values) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function validProbList(values) {
  for (const value of values) {
    if (!Number.isFinite(value)) return false;
    if (value < 0 || value > 1) return false;
  }
  return true;
}

function validBinaryList(values) {
  for (const value of values) {
    if (value !== 0 && value !== 1) return false;
  }
  return true;
}

function halfSquareDistance(probs, outcomes) {
  let sum = 0;
  for (let index = 0; index < probs.length; index++) {
    const gap = probs[index] - outcomes[index];
    sum += gap * gap;
  }
  return sum / 2;
}

function onesForIndex(size, index) {
  const vec = [];
  for (let i = 0; i < size; i++) {
    if (i === index) vec.push(1);
    else vec.push(0);
  }
  return vec;
}

function onesForKey(keys, want) {
  const vec = [];
  for (const key of keys) {
    if (key === want) vec.push(1);
    else vec.push(0);
  }
  return vec;
}

function onesFromObjectOutcome(keys, outcome) {
  const vec = [];
  let total = 0;
  for (const key of keys) {
    const raw = Number(outcome[key] || 0);
    if (raw !== 0 && raw !== 1) return null;
    vec.push(raw);
    total += raw;
  }
  if (total !== 1) return null;
  return vec;
}

function arrayOutcomeVector(item, size) {
  const outcome = item.outcome;
  if (Array.isArray(outcome)) {
    if (outcome.length !== size) return null;
    if (!validBinaryList(outcome)) return null;
    return outcome.map(Number);
  }
  const index = Number(outcome);
  if (!Number.isInteger(index)) return null;
  if (index < 0 || index >= size) return null;
  return onesForIndex(size, index);
}

function calculateArrayBrier(item) {
  const probs = item.prediction.map(Number);
  if (probs.length < 2) return NaN;
  if (!validProbList(probs)) return NaN;
  if (Math.abs(probTotal(probs) - 1) > 1e-6) return NaN;
  const outcomes = arrayOutcomeVector(item, probs.length);
  if (outcomes === null) return NaN;
  return halfSquareDistance(probs, outcomes);
}

function objectProbPack(item) {
  const pred = item.prediction;
  if (pred === null || typeof pred !== 'object') return null;
  if (Array.isArray(pred)) return null;
  const keys = Object.keys(pred);
  if (keys.length < 2) return null;
  const probs = [];
  for (const key of keys) probs.push(Number(pred[key]));
  if (!validProbList(probs)) return null;
  if (Math.abs(probTotal(probs) - 1) > 1e-6) return null;
  return { keys, probs };
}

function stringObjectBrier(pack, outcome) {
  if (pack.keys.indexOf(outcome) < 0) return NaN;
  return halfSquareDistance(pack.probs, onesForKey(pack.keys, outcome));
}

function calculateObjectBrier(item) {
  const pack = objectProbPack(item);
  if (pack === null) return NaN;
  const outcome = item.outcome;
  if (typeof outcome === 'string') return stringObjectBrier(pack, outcome);
  if (outcome === null || typeof outcome !== 'object') return NaN;
  const ones = onesFromObjectOutcome(pack.keys, outcome);
  if (ones === null) return NaN;
  return halfSquareDistance(pack.probs, ones);
}

function calculateScalarBrier(item) {
  const prediction = Number(item.prediction);
  const outcome = Number(item.outcome);
  if (!Number.isFinite(prediction) || prediction < 0 || prediction > 1) return NaN;
  if (outcome !== 0 && outcome !== 1) return NaN;
  const gap = prediction - outcome;
  return gap * gap;
}

function calculateItemBrierScore(item) {
  if (item === null || item === undefined) return NaN;
  const prediction = item.prediction;
  if (Array.isArray(prediction)) return calculateArrayBrier(item);
  if (prediction !== null && typeof prediction === 'object') return calculateObjectBrier(item);
  return calculateScalarBrier(item);
}

function meanFiniteBrier(items) {
  let sum = 0;
  let count = 0;
  for (const item of items) {
    const score = calculateItemBrierScore(item);
    if (Number.isFinite(score)) {
      sum += score;
      count += 1;
    }
  }
  if (count === 0) return NaN;
  return sum / count;
}

function resolveThreshold(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 1) return numeric;
  return DEFAULT_THRESHOLD;
}

function requiredVoters(activeCount) {
  if (!Number.isFinite(activeCount) || activeCount < 0) return MIN_VOTERS_FLOOR;
  const scaled = Math.ceil(Number(activeCount) * PARTICIPATION_RATIO);
  if (scaled > MIN_VOTERS_FLOOR) return scaled;
  return MIN_VOTERS_FLOOR;
}

function specNumber(spec, key) {
  if (spec === null || spec === undefined) return NaN;
  return Number(spec[key]);
}

function explicitFloor(spec) {
  const votes = specNumber(spec, 'minVotes');
  if (Number.isFinite(votes) && votes >= 0) return Math.floor(votes);
  const part = specNumber(spec, 'minParticipation');
  if (Number.isFinite(part) && part >= 0) return Math.floor(part);
  return null;
}

function knownActive(spec) {
  const direct = specNumber(spec, 'activeCount');
  if (Number.isFinite(direct)) return direct;
  const nodes = specNumber(spec, 'activeNodeCount');
  if (Number.isFinite(nodes)) return nodes;
  return null;
}

function resolveMinParticipation(spec) {
  const explicit = explicitFloor(spec);
  if (explicit !== null) return explicit;
  const active = knownActive(spec);
  if (active !== null) return requiredVoters(active);
  return MIN_VOTERS_FLOOR;
}

function tallyTotal(tally) {
  let total = 0;
  const names = Object.keys(tally);
  for (const name of names) total += Number(tally[name]);
  return total;
}

function topOfTally(tally) {
  let top = null;
  let topValue = 0;
  let tied = false;
  const names = Object.keys(tally);
  for (const name of names) {
    const value = Number(tally[name]);
    if (top === null || value > topValue + EPSILON) {
      top = name;
      topValue = value;
      tied = false;
    } else if (Math.abs(value - topValue) <= EPSILON) {
      tied = true;
    }
  }
  return { top, topValue, tied };
}

function approvalOf(topValue, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return topValue / total;
}

function quorumDecision(pack) {
  const found = topOfTally(pack.tally);
  const total = tallyTotal(pack.tally);
  const rate = approvalOf(found.topValue, total);
  if (found.top === null || total <= 0) return { decision: null, status: 'empty', approvalRate: rate };
  if (found.tied) return { decision: null, status: 'tied', approvalRate: rate };
  if (rate >= resolveThreshold(pack.threshold)) return { decision: found.top, status: 'won', approvalRate: rate };
  return { decision: null, status: 'below_threshold', approvalRate: rate };
}

function participationOf(pack) {
  if (pack === null || pack === undefined) return 0;
  const direct = Number(pack.participationCount);
  if (Number.isFinite(direct)) return direct;
  const fallback = Number(pack.expressedCount);
  if (Number.isFinite(fallback)) return fallback;
  return 0;
}

function evaluateQuorum(pack) {
  const floor = resolveMinParticipation(pack);
  const decided = quorumDecision(pack);
  const voters = participationOf(pack);
  if (decided.status === 'tied') return { quorumReached: false, decision: null, status: 'tied', approvalRate: decided.approvalRate, requiredVotes: floor, participationCount: voters };
  if (voters < floor) return { quorumReached: false, decision: null, status: 'no_quorum', approvalRate: decided.approvalRate, requiredVotes: floor, participationCount: voters };
  if (decided.status !== 'won') return { quorumReached: false, decision: null, status: decided.status, approvalRate: decided.approvalRate, requiredVotes: floor, participationCount: voters };
  return { quorumReached: true, decision: decided.decision, status: 'won', approvalRate: decided.approvalRate, requiredVotes: floor, participationCount: voters };
}

function quorumMetCanonical(spec) {
  const need = requiredVoters(spec.active);
  if (spec.participation < need) return false;
  const valid = spec.yes + spec.no;
  if (valid <= 0) return false;
  return spec.yes / valid >= resolveThreshold(spec.threshold);
}

function rejectionCanonical(spec) {
  const remaining = spec.active - spec.participation;
  let spare = 0;
  if (remaining > 0) spare = remaining;
  const maxYes = spec.yes + spare;
  const maxValid = spec.yes + spec.no + spare;
  if (maxValid <= 0) return false;
  return maxYes / maxValid < resolveThreshold(spec.threshold);
}

function resolveProposalStatus(spec) {
  if (spec.active === 0 && spec.participation === 0) return { status: 'expired', reason: 'no_active_nodes' };
  if (quorumMetCanonical(spec)) return { status: 'passed', reason: '' };
  if (rejectionCanonical(spec)) return { status: 'rejected', reason: '' };
  return { status: 'open', reason: '' };
}

function emptySwarmTally() {
  return { yesCount: 0, noCount: 0, abstainCount: 0, participationCount: 0, yesWeight: 0, noWeight: 0 };
}

function tallyVotesOf(pack) {
  if (pack === null || pack === undefined) return [];
  const votes = pack.votes;
  if (Array.isArray(votes)) return votes;
  return [];
}

function tallyWeightedOf(pack) {
  if (pack === null || pack === undefined) return false;
  return pack.weighted === true;
}

function entryWeight(weighted, entry) {
  if (!weighted) return 1;
  if (entry === null || entry === undefined) return 1;
  const raw = Number(entry.weight);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 1;
}

function addSwarmTallyEntry(out, weighted, entry) {
  if (entry === null || entry === undefined) return;
  const text = normalizeVoteText(entry.vote);
  out.participationCount += 1;
  if (text === 'abstain') {
    out.abstainCount += 1;
    return;
  }
  if (text !== 'yes' && text !== 'no') return;
  const weight = entryWeight(weighted, entry);
  if (text === 'yes') {
    out.yesCount += 1;
    out.yesWeight += weight;
  } else {
    out.noCount += 1;
    out.noWeight += weight;
  }
}

function tallySwarmVotes(pack) {
  const out = emptySwarmTally();
  const votes = tallyVotesOf(pack);
  const weighted = tallyWeightedOf(pack);
  for (const entry of votes) addSwarmTallyEntry(out, weighted, entry);
  return out;
}

module.exports = {
  DEFAULT_THRESHOLD,
  EPSILON,
  PARTICIPATION_RATIO,
  MIN_VOTERS_FLOOR,
  isAbstentionText,
  normalizeVoteText,
  voteTextForIssue,
  brierScoreToWeight,
  countOf,
  calculateItemBrierScore,
  meanFiniteBrier,
  resolveThreshold,
  requiredVoters,
  resolveMinParticipation,
  tallyTotal,
  topOfTally,
  quorumDecision,
  participationOf,
  evaluateQuorum,
  quorumMetCanonical,
  rejectionCanonical,
  resolveProposalStatus,
  tallySwarmVotes
};

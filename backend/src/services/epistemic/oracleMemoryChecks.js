'use strict';

const VERSION = 'genos.promotion-memory-fidelity/v1';
const STRATEGIES = new Set(['memory_rendered', 'memory_parsed']);
const PREFIX = '[RECORDED_EXPERIENCE] Task: ';
function outcome(status, reason) { return { version: VERSION, status, reason, sourceTruth: 'not_evaluated' }; }

function supported(source) {
  const claims = source.report?.claims;
  return typeof source.task === 'string' && source.task.length <= 12000
    && Array.isArray(claims) && claims.length > 0 && claims.length <= 16 && claims.every(supportedClaim)
    && !source.philosophy && !source.epistemicContext && !source.ethicalComparison;
}

function supportedClaim(claim) {
  return typeof claim.statement === 'string' && claim.statement.length <= 4096
    && Array.isArray(claim.evidence) && claim.evidence.length <= 32 && claim.evidence.length > 0
    && claim.evidence.every(item => typeof item === 'string' && item.length <= 4096);
}

function factsMatch(subject) {
  const { memory, source } = subject;
  const claims = source.report.claims;
  const summary = claims.map(item => item.statement).filter(Boolean).join('\n');
  return memory.category === 'Experience' && memory.payload.agentId === source.agentId
    && memory.payload.task === source.task && memory.payload.summary === summary.slice(0, 500)
    && require('node:util').isDeepStrictEqual(memory.payload.claims, claims);
}

function rendered(subject) {
  const { source, memory } = subject;
  const summary = source.report.claims.map(item => item.statement).filter(Boolean).join('\n').slice(0, 800);
  const claims = source.report.claims.map(item => `[${item.statement} | evidence: ${item.evidence.join(', ')}]`).join('; ');
  return memory.content === `${PREFIX}${source.task}\nResult: ${summary}\nClaims: ${claims}`;
}

function parsed(subject) {
  const text = subject.memory.content;
  const source = subject.source;
  if (!text.startsWith(PREFIX)) return false;
  const start = PREFIX.length + source.task.length;
  if (text.slice(PREFIX.length, start) !== source.task || text.slice(start, start + 9) !== '\nResult: ') return false;
  const summary = source.report.claims.reduce((parts, claim) => claim.statement ? [...parts, claim.statement] : parts, []).join('\n').slice(0, 800);
  let position = start + 9;
  if (text.slice(position, position + summary.length) !== summary) return false;
  position += summary.length;
  if (text.slice(position, position + 9) !== '\nClaims: ') return false;
  position += 9;
  for (const [index, claim] of source.report.claims.entries()) {
    const tokens = [index ? '; [' : '[', claim.statement, ' | evidence: ', claim.evidence.join(', '), ']'];
    position = consume(text, tokens, position);
    if (position === null) return false;
  }
  return position === text.length;
}

function consume(text, tokens, position) {
  for (const token of tokens) {
    if (text.slice(position, position + token.length) !== token) return null;
    position += token.length;
  }
  return position;
}

function checkMemory(subject, strategy) {
  if (!STRATEGIES.has(strategy)) return outcome('inconclusive', 'memory_oracle_strategy_unavailable');
  if (!subject?.memory || !subject.source || !supported(subject.source)) return outcome('inconclusive', 'memory_oracle_domain_unavailable');
  const matched = factsMatch(subject) && (strategy === 'memory_rendered' ? rendered(subject) : parsed(subject))
    && verificationAccepted(subject);
  return { ...outcome(matched ? 'verified' : 'refuted', matched ? 'memory_fidelity_checked' : 'memory_source_contradiction'), strategy };
}

function verificationAccepted(subject) {
  return subject.verification === undefined || subject.verification.verdict === 'accept';
}

module.exports = { VERSION, STRATEGIES, checkMemory };

'use strict';

const MISSION_STOP_WORDS = new Set([
  'agent', 'worker', 'scope', 'mission', 'task', 'work', 'assigned',
  'delegated', 'the', 'and', 'for', 'from', 'with', 'into', 'this', 'that',
  'une', 'des', 'les', 'dans', 'pour', 'avec', 'sur', 'par', 'qui', 'que',
  'est', 'faire', 'implementation', 'implement', 'review', 'verify', 'audit',
  'investigate'
]);

function humanize(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function roleFamily(role) {
  const normalized = humanize(role).toLowerCase();
  if (/literary author|writer|stylist/.test(normalized)) return 'literary_creation';
  if (/dramaturg/.test(normalized)) return 'dramaturgy';
  if (/literary critic/.test(normalized)) return 'literary_criticism';
  if (/red team|attack|offensive/.test(normalized)) return 'security_attack';
  if (/blue team|defen|hardening/.test(normalized)) return 'security_defense';
  if (/review|observer|verif|audit|test|qa/.test(normalized)) return 'verification';
  if (/implement|coder|developer|engineer/.test(normalized)) return 'implementation';
  if (/research|investig|analys|diagnos/.test(normalized)) return 'investigation';
  return 'generic';
}

function missionTokens(value) {
  return humanize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => {
      if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
      if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is') && !['always', 'analysis', 'status', 'process'].includes(token)) {
        return token.slice(0, -1);
      }
      return token;
    })
    .filter((token) => token.length >= 3 && !MISSION_STOP_WORDS.has(token));
}

function reuseAffinity(worker, { mission, role } = {}) {
  if (!worker) return null;
  const requestedFamily = roleFamily(role);
  const workerFamily = roleFamily(worker.role);
  if (requestedFamily !== 'generic' && workerFamily !== requestedFamily) return null;
  const affinity = missionAffinity(mission, `${worker.about || ''} ${worker.name || ''}`);
  return affinity.matches ? affinity : null;
}

function missionAffinity(mission, scope) {
  const missionSet = new Set(missionTokens(mission));
  const scopeSet = new Set(missionTokens(scope));
  const shared = [...missionSet].filter((token) => scopeSet.has(token));
  if (!missionSet.size || !scopeSet.size) return { matches: false, score: 0, shared };
  const missionCoverage = shared.length / missionSet.size;
  const scopeCoverage = shared.length / scopeSet.size;
  const singleSpecificMatch = shared.length === 1 && Math.min(missionSet.size, scopeSet.size) === 1 && shared[0].length >= 5;
  const matches = shared.length >= 2 && (missionCoverage >= 0.4 || scopeCoverage >= 0.4) || singleSpecificMatch;
  return { matches, score: matches ? shared.length * 10 + missionCoverage * 3 + scopeCoverage : 0, shared };
}

module.exports = { missionAffinity, reuseAffinity };

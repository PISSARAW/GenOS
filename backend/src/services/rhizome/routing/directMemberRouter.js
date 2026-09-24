'use strict';

function route(input) {
  const target = String(input.need || '').trim();
  if (!target) throw Object.assign(new Error('A non-empty capability need is required.'), { code: 'RHIZOME_NEED_REQUIRED' });
  const alternatives = rankMembers(input.session, target, input.now);
  return decide({ sessionId: input.sessionId, target, alternatives, coherent: input.coherent });
}

function rankMembers(session, target, now) {
  const capable = session.members.filter((member) => member.role === target || member.capabilities.includes(target));
  const marker = `route:capability/${target}`;
  return capable.map((member) => ({
    role: member.role,
    score: signalScore({ session, marker, member, target, now }),
    signals: memberSignals({ session, marker, member, target, now })
  })).sort((left, right) => right.score - left.score || left.role.localeCompare(right.role));
}

function signalScore(input) {
  const shared = input.session.matrix.getDecayedIntensity(input.marker, input.now);
  const memberMarker = `route:member/${input.member.role}/${input.target}`;
  return Number((shared + input.session.matrix.getDecayedIntensity(memberMarker, input.now)).toFixed(4));
}

function memberSignals(input) {
  const routeMarker = `route:member/${input.member.role}/${input.target}`;
  const signals = [];
  for (const key of [input.marker, routeMarker]) {
    const intensity = input.session.matrix.getDecayedIntensity(key, input.now);
    if (intensity) signals.push({ marker: key, intensity });
  }
  return signals;
}

function decide(input) {
  if (!input.alternatives.length) return decision(input, null, 'no_capable_member');
  const best = input.alternatives[0];
  if (best.score < 0) return { ...decision(input, null, 'repelled'), alternatives: input.alternatives };
  if (input.coherent === false) return { ...decision(input, null, 'incoherent'), alternatives: input.alternatives };
  return {
    ...decision(input, best.role, 'member_selected'), score: best.score,
    signals: best.signals, alternatives: input.alternatives
  };
}

function decision(input, memberRole, verdict) {
  return { sessionId: input.sessionId, need: input.target, memberRole, selected: memberRole !== null, verdict };
}

module.exports = { route };

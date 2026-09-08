async function greyWolf(context = {}) {
  const wolves = Array.isArray(context.wolves) ? context.wolves : [];
  if (wolves.length < 3) return { success: false, error: 'at least three wolves are required.', code: 'WOLVES_REQUIRED' };
  const ranked = wolves.map((wolf, index) => ({ ...wolf, id: String(wolf.id || index + 1), score: Number(wolf.score || 0) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { success: true, alpha: ranked[0], beta: ranked[1], delta: ranked[2], ranked };
}

async function positionUpdate(context = {}) {
  const current = context.current || { x: 0, y: 0 };
  const attractors = Array.isArray(context.attractors) ? context.attractors : [];
  if (!attractors.length) return { success: false, error: 'attractors are required.', code: 'ATTRACTORS_REQUIRED' };
  const average = attractors.reduce((sum, item) => ({ x: sum.x + Number(item.x || 0), y: sum.y + Number(item.y || 0) }), { x: 0, y: 0 });
  average.x /= attractors.length; average.y /= attractors.length;
  const rate = Math.min(1, Math.max(0, Number(context.rate ?? 0.5)));
  return { success: true, previous: current, position: { x: Number(current.x || 0) + (average.x - Number(current.x || 0)) * rate, y: Number(current.y || 0) + (average.y - Number(current.y || 0)) * rate } };
}

async function capabilityRoute(context = {}) {
  const agents = Array.isArray(context.agents) ? context.agents : [];
  const required = new Set((context.requiredCapabilities || []).map(String));
  if (!agents.length) return { success: false, error: 'agents are required.', code: 'AGENTS_REQUIRED' };
  const ranked = agents.map((agent, index) => ({ agent, id: String(agent.id || index + 1), matched: (agent.capabilities || []).filter((capability) => required.has(String(capability))).length })).sort((a, b) => b.matched - a.matched || a.id.localeCompare(b.id));
  return { success: true, selected: ranked[0], ranked };
}

async function knowledgeTransfer(context = {}) {
  const source = context.source || {};
  const target = context.target || {};
  const knowledge = Array.isArray(source.knowledge) ? source.knowledge : [];
  if (!knowledge.length) return { success: false, error: 'source knowledge is required.', code: 'KNOWLEDGE_REQUIRED' };
  const existing = new Set(Array.isArray(target.knowledge) ? target.knowledge.map(String) : []);
  const transferred = knowledge.filter((item) => !existing.has(String(item)));
  return { success: true, transferred, targetKnowledge: [...existing, ...transferred.map(String)] };
}

async function dynamicAssignment(context = {}) {
  const agents = Array.isArray(context.agents) ? context.agents : [];
  const roles = Array.isArray(context.roles) ? context.roles.map(String) : [];
  if (!agents.length || !roles.length) return { success: false, error: 'agents and roles are required.', code: 'ASSIGNMENT_INPUT_REQUIRED' };
  const assignments = agents.map((agent, index) => ({ agentId: String(agent.id || index + 1), role: roles[index % roles.length], score: Number(agent.score || 0) }));
  return { success: true, assignments };
}

async function networkSilence(context = {}) {
  const messages = Array.isArray(context.messages) ? context.messages : [];
  const critical = messages.filter((message) => message.critical === true || message.status === 'success' || message.status === 'failure');
  return { success: true, buffered: messages.length - critical.length, flushed: critical, suppressed: messages.filter((message) => !critical.includes(message)) };
}

async function solverTournament(context = {}) {
  const solvers = Array.isArray(context.solvers) ? context.solvers : [];
  if (!solvers.length) return { success: false, error: 'solvers are required.', code: 'SOLVERS_REQUIRED' };
  const ranked = solvers.map((solver, index) => ({ ...solver, id: String(solver.id || index + 1), score: Number(solver.score || 0) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { success: true, winner: ranked[0], ranked, tournamentSize: ranked.length };
}

module.exports = { greyWolf, positionUpdate, capabilityRoute, knowledgeTransfer, dynamicAssignment, networkSilence, solverTournament };

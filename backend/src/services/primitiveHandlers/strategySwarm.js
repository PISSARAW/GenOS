function points(context = {}) {
  return Array.isArray(context.points) ? context.points : Array.isArray(context.agents) ? context.agents : [];
}

function vector(value) {
  return { x: Number(value?.x || 0), y: Number(value?.y || 0) };
}

async function flocking(context = {}) {
  const items = points(context);
  if (!items.length) return { success: false, error: 'points are required.', code: 'POINTS_REQUIRED' };
  const positions = items.map((item) => vector(item.position || item));
  const velocities = items.map((item) => vector(item.velocity));
  const center = positions.reduce((sum, position) => ({ x: sum.x + position.x, y: sum.y + position.y }), { x: 0, y: 0 });
  center.x /= positions.length; center.y /= positions.length;
  const averageVelocity = velocities.reduce((sum, velocity) => ({ x: sum.x + velocity.x, y: sum.y + velocity.y }), { x: 0, y: 0 });
  averageVelocity.x /= positions.length; averageVelocity.y /= positions.length;
  const separation = positions.reduce((sum, position) => ({ x: sum.x + center.x - position.x, y: sum.y + center.y - position.y }), { x: 0, y: 0 });
  return { success: true, separation, alignment: averageVelocity, cohesion: { x: center.x, y: center.y }, count: items.length };
}

async function weightedBarycenter(context = {}) {
  const items = points(context);
  if (!items.length) return { success: false, error: 'points are required.', code: 'POINTS_REQUIRED' };
  let total = 0;
  const center = { x: 0, y: 0 };
  for (const item of items) {
    const weight = Math.max(0, Number(item.weight ?? item.score ?? 1));
    const position = vector(item.position || item);
    total += weight;
    center.x += position.x * weight;
    center.y += position.y * weight;
  }
  return { success: true, barycenter: total ? { x: center.x / total, y: center.y / total } : null, totalWeight: total };
}

async function pathConductivity(context = {}) {
  const paths = Array.isArray(context.paths) ? context.paths : [];
  if (!paths.length) return { success: false, error: 'paths are required.', code: 'PATHS_REQUIRED' };
  const ranked = paths.map((path, index) => ({ id: String(path.id || index + 1), conductivity: Math.max(0, Number(path.conductivity ?? path.strength ?? 0)), path })).sort((a, b) => b.conductivity - a.conductivity || a.id.localeCompare(b.id));
  return { success: true, ranked, selected: ranked[0] };
}

async function roleGradient(context = {}) {
  const items = points(context);
  const roles = Array.isArray(context.roles) ? context.roles.map(String).filter(Boolean) : [];
  if (!items.length || !roles.length) return { success: false, error: 'points and roles are required.', code: 'ROLE_INPUT_REQUIRED' };
  const assignments = items.map((item, index) => ({ id: String(item.id || index + 1), role: roles[index % roles.length], gradient: index / Math.max(1, items.length - 1) }));
  return { success: true, assignments };
}

async function energyObserve(context = {}) {
  const items = points(context);
  if (!items.length) return { success: false, error: 'agents are required.', code: 'AGENTS_REQUIRED' };
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.energy ?? item.budget ?? 0)), 0);
  const average = total / items.length;
  return { success: true, averageEnergy: average, deficits: items.filter((item) => Number(item.energy ?? item.budget ?? 0) < average).map((item) => item.id), surplus: items.filter((item) => Number(item.energy ?? item.budget ?? 0) > average).map((item) => item.id) };
}

async function elo(context = {}) {
  const players = Array.isArray(context.players) ? context.players : [];
  if (!players.length) return { success: false, error: 'players are required.', code: 'PLAYERS_REQUIRED' };
  const ranked = players.map((player, index) => ({ id: String(player.id || index + 1), rating: Number(player.rating ?? 1000), wins: Number(player.wins || 0), losses: Number(player.losses || 0) })).map((player) => ({ ...player, rating: player.rating + (player.wins - player.losses) * Number(context.kFactor || 32) })).sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  return { success: true, ranked, winner: ranked[0] };
}

module.exports = { flocking, weightedBarycenter, pathConductivity, roleGradient, energyObserve, elo };

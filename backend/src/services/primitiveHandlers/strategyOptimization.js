function candidatesFrom(context = {}) {
  return Array.isArray(context.candidates) ? context.candidates.filter(Boolean) : [];
}

async function rankStates(context = {}) {
  const candidates = candidatesFrom(context);
  if (!candidates.length) return { success: false, error: 'candidates are required.', code: 'CANDIDATES_REQUIRED' };
  const ranked = candidates.map((candidate, index) => {
    const id = typeof candidate === 'string' ? candidate : String(candidate.id || `candidate-${index + 1}`);
    const score = Number.isFinite(Number(context.scores?.[id])) ? Number(context.scores[id]) : Number(candidate.score || 0);
    return { id, candidate, score };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return { success: true, ranked, best: ranked[0], count: ranked.length };
}

async function preserveLosers(context = {}) {
  const candidates = candidatesFrom(context);
  if (!candidates.length) return { success: false, error: 'candidates are required.', code: 'CANDIDATES_REQUIRED' };
  const winnerId = context.winnerId || context.winner_id;
  const losers = candidates.filter((candidate, index) => String(candidate.id || candidate) !== String(winnerId || candidates[0]?.id || candidates[0]));
  return { success: true, winnerId: String(winnerId || candidates[0]?.id || candidates[0]), preservedLosers: losers, preservedCount: losers.length, destructivePrune: false };
}

async function varianceAnalysis(context = {}) {
  const values = Array.isArray(context.values) ? context.values.map(Number).filter(Number.isFinite) : [];
  if (!values.length) return { success: false, error: 'numeric values are required.', code: 'VALUES_REQUIRED' };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return { success: true, count: values.length, mean, variance, standardDeviation: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) };
}

async function temperatureSchedule(context = {}) {
  const iterations = Number(context.iterations ?? 10);
  const initial = Number(context.initialTemperature ?? context.initial ?? 1);
  const cooling = Number(context.coolingRate ?? 0.95);
  if (!Number.isInteger(iterations) || iterations < 1 || !Number.isFinite(initial) || initial <= 0 || !Number.isFinite(cooling) || cooling <= 0 || cooling >= 1) {
    return { success: false, error: 'iterations, initialTemperature and coolingRate are invalid.', code: 'TEMPERATURE_INVALID' };
  }
  const temperatures = Array.from({ length: iterations }, (_, index) => initial * (cooling ** index));
  return { success: true, temperatures, finalTemperature: temperatures[temperatures.length - 1] };
}

async function resourceShift(context = {}) {
  const resources = Number(context.resources ?? context.totalResources);
  const targets = Array.isArray(context.targets) ? context.targets : [];
  if (!Number.isFinite(resources) || resources < 0 || !targets.length) return { success: false, error: 'resources and targets are required.', code: 'RESOURCE_INPUT_INVALID' };
  const weights = targets.map((target) => Math.max(0, Number(target.weight ?? target.score ?? 0)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const allocation = targets.map((target, index) => ({ id: String(target.id || index + 1), amount: total ? resources * weights[index] / total : resources / targets.length }));
  return { success: true, allocation, totalAllocated: allocation.reduce((sum, item) => sum + item.amount, 0) };
}

module.exports = { rankStates, preserveLosers, varianceAnalysis, temperatureSchedule, resourceShift };

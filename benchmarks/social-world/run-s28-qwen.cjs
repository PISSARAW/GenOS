'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const topology = require('../../backend/src/services/swarmTopologyAlgorithms');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const CYCLES = 1000;
const AGENT_COUNT = 24;
function random(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function saveResult(seed, result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `S28-seed-${String(seed).padStart(2, '0')}-result.json`), `${JSON.stringify(result, null, 2)}\n`);
}
function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/); if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]); return { cycles: Number(value.cycles), agents: Number(value.agents), topologySteps: Number(value.topologySteps), shocksRecovered: Number(value.shocksRecovered), finiteState: value.finiteState };
}
function finiteAgents(agents) { return agents.every((agent) => Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.heading) && Number.isFinite(agent.fitness)); }
function simulate(seed) {
  const rng = random(seed); const agents = Array.from({ length: AGENT_COUNT }, (_, index) => {
    const angle = 2 * Math.PI * index / AGENT_COUNT; const radius = 4 + rng() * 2;
    return { id: `agent-${String(index).padStart(2, '0')}`, role: index % 3 === 0 ? 'specialist' : 'member', x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, heading: angle, fitness: 1 + rng() * 4 };
  });
  let edges = Array.from({ length: AGENT_COUNT }, (_, index) => [
    { id: `edge-${index}-${(index + 1) % AGENT_COUNT}`, flow: 1, conductivity: 0.5 },
    { id: `edge-${index}-${(index + 5) % AGENT_COUNT}`, flow: 0.5, conductivity: 0.35 }
  ]).flat();
  let shocksInjected = 0; let shocksRecovered = 0; let topologySteps = 0; let finite = true; let maximumRadius = 0;
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    if (cycle % 100 === 0 && cycle < CYCLES) {
      const affected = agents[(cycle / 100 + seed) % AGENT_COUNT | 0];
      affected.x += (rng() - 0.5) * 6; affected.y += (rng() - 0.5) * 6; shocksInjected++;
    }
    const boids = topology.runTopologyStep('flocking_boids', { agents }, { cohesion: 0.04, alignment: 0.03, separation: 0.08, separationRadius: 1.2 });
    const fish = topology.runTopologyStep('fish_school_search', { agents }, { step: 0.03 });
    const slime = topology.runTopologyStep('slime_mould_network', { edges }, { reinforcement: 1.015, decay: 0.997, pruneBelow: 0.02 });
    const wolves = topology.runTopologyStep('grey_wolf_optimizer', { pack: agents }, { step: 0.015 });
    topologySteps += 4;
    const boidById = new Map(boids.agents.map((entry) => [entry.id, entry]));
    const fishById = new Map(fish.individuals.map((entry) => [entry.id, entry]));
    const wolfById = new Map(wolves.pack.map((entry) => [entry.id, entry]));
    for (const agent of agents) {
      const b = boidById.get(agent.id); const f = fishById.get(agent.id); const w = wolfById.get(agent.id);
      agent.x = Math.max(-12, Math.min(12, agent.x + b.vector.x * 0.12 + f.volitive.x * 0.08 + (w.position.x - agent.x) * 0.01));
      agent.y = Math.max(-12, Math.min(12, agent.y + b.vector.y * 0.12 + f.volitive.y * 0.08 + (w.position.y - agent.y) * 0.01));
      agent.heading = b.heading; agent.fitness = Math.max(0.1, Math.min(8, agent.fitness + (rng() - 0.5) * 0.01));
      maximumRadius = Math.max(maximumRadius, Math.hypot(agent.x, agent.y));
    }
    const active = new Set(slime.edges.map((edge) => edge.id));
    edges = edges.map((edge) => ({ ...edge, flow: active.has(edge.id) ? Math.min(1, edge.flow + 0.002) : 0, conductivity: Math.min(2, edge.conductivity) }));
    if (require('./run-s28-qwenValues1.cjs').simulateValue3({ AGENT_COUNT, agents, get edges() { return edges; }, finiteAgents })) { finite = false; break; }
    if (require('./run-s28-qwenValues1.cjs').simulateValue1({ CYCLES, agents, get cycle() { return cycle; }, finiteAgents })) shocksRecovered++;
  }
  return { cycles: finite ? CYCLES : null, agents: agents.length, topologySteps, shocksInjected, shocksRecovered, finiteState: finite, relationshipEdges: edges.length, maximumRadius: Number(maximumRadius.toFixed(4)), finalMeanFitness: Number((agents.reduce((sum, agent) => sum + agent.fitness, 0) / agents.length).toFixed(4)) };
}
async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed=')); const seed = seedArg ? Number(seedArg.split('=')[1]) : 1;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); const startedAt = Date.now(); let qwenResponse = null;
  try {
    const observed = simulate(seed); const expected = { cycles: CYCLES, agents: AGENT_COUNT, topologySteps: CYCLES * 4, shocksRecovered: 9, finiteState: true };
    const enginePass = require('./run-s28-qwenValues1.cjs').mainValue2({ AGENT_COUNT, CYCLES, observed });
    const response = await modelProvider.generate({ model: MODEL, prompt: ['Read this 24-agent SocialWorld integration result from 1,000 cycles. Copy the cycle count, agent count, topology step count, recovered shock count and finite-state result.', `Observed: ${JSON.stringify(observed)}`, 'Return ONLY JSON with cycles, agents, topologySteps, shocksRecovered, finiteState.'].join('\n\n'), seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000 });
    qwenResponse = response.text; const answer = parseAnswer(qwenResponse); const passed = enginePass && JSON.stringify(answer) === JSON.stringify(expected);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S28', seed, status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, observed, qwenResponse, answer, enginePass, verified: passed, oracle: '24 agents execute four GenOS topology algorithms for 1,000 bounded cycles; all nine injected shocks recover with finite state and stable population/relations', humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(seed, result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!passed) process.exitCode = 1;
  } catch (error) { const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S28', seed, status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message, qwenResponse, verified: false, durationMs: Date.now() - startedAt }; saveResult(seed, result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1; }
}
main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });

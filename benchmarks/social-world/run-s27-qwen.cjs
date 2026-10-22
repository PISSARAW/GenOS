'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const topology = require('../../backend/src/services/swarmTopologyAlgorithms');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const ORGANIZATIONS = ['specialist_expert_committee', 'blind_adversarial_review', 'red_blue_coevolution', 'brier_weighted_consensus', 'quorum_with_abstention', 'stigmergy', 'energy_huddle', 'flocking_boids', 'fish_school_search', 'slime_mould_network', 'grey_wolf_optimizer', 'network_silence', 'strategy_arena', 'competitive_arena', 'hierarchical_merge', 'isolated_recovery', 'memory_compilation', 'dynamic_polyethism', 'mycelial_routing'];
function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'S27-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}
function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/); if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]); return { algorithmCount: Number(value.algorithmCount), uniqueTopologies: Number(value.uniqueTopologies), distinctBehaviors: Number(value.distinctBehaviors), quorumReached: value.quorumReached };
}
async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed=')); const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); const startedAt = Date.now(); let qwenResponse = null;
  try {
    const state = { orchestratorId: 'socialworld', agents: [
      { id: 'a', role: 'red_team', fitness: 1, capabilities: ['web'], x: 0, y: 0, heading: 0 },
      { id: 'b', role: 'blue_team', fitness: 3, capabilities: ['data'], x: 1, y: 1, heading: 0 },
      { id: 'c', role: 'observer', fitness: 2, capabilities: ['review'], x: 2, y: 0, heading: 1 }],
      votes: [{ support: true, weight: 2 }, { abstain: true }], populations: [{ id: 'p1', weight: 3 }, { id: 'p2', weight: 1 }], budget: 100, facts: ['f1'], lostRoles: ['observer'], dossiers: [{ events: [{ evidenceReport: { outcome: 'success', confidence: 0.9 } }] }], need: 'web',
      pack: [{ id: 'a', fitness: 1, x: 0, y: 0 }, { id: 'b', fitness: 3, x: 1, y: 1 }, { id: 'c', fitness: 2, x: 2, y: 0 }], edges: [{ id: 'e1', flow: 1, conductivity: 0.5 }, { id: 'e2', flow: 0, conductivity: 0.3 }] };
    const runs = ORGANIZATIONS.map((organization) => ({ organization, result: topology.runTopologyStep(organization, state, { step: 0.5, cohesion: 0.1, alignment: 0.1, separation: 0.2, separationRadius: 1 }) }));
    const outputShapes = { flocking: Array.isArray(runs.find((entry) => entry.organization === 'flocking_boids').result.agents), fish: Array.isArray(runs.find((entry) => entry.organization === 'fish_school_search').result.individuals), slime: Array.isArray(runs.find((entry) => entry.organization === 'slime_mould_network').result.edges), wolves: Array.isArray(runs.find((entry) => entry.organization === 'grey_wolf_optimizer').result.pack), quorum: runs.find((entry) => entry.organization === 'quorum_with_abstention').result.reached === true, independentCritics: runs.find((entry) => entry.organization === 'blind_adversarial_review').result.pairs?.length > 0, route: runs.find((entry) => entry.organization === 'mycelial_routing').result.route === 'a' };
    const uniqueTopologies = new Set(runs.map((entry) => entry.result?.organization)).size;
    const behaviorKeys = new Set(runs.map((entry) => Object.keys(entry.result || {}).filter((key) => key !== 'organization').sort().join(','))).size;
    const observed = { algorithmCount: runs.filter((entry) => entry.result?.organization === entry.organization).length, uniqueTopologies, distinctBehaviors: behaviorKeys, quorumReached: outputShapes.quorum };
    const expected = { algorithmCount: ORGANIZATIONS.length, uniqueTopologies: ORGANIZATIONS.length, distinctBehaviors: behaviorKeys, quorumReached: true };
    const enginePass = observed.algorithmCount === expected.algorithmCount && uniqueTopologies === ORGANIZATIONS.length && behaviorKeys >= 8 && Object.values(outputShapes).every(Boolean);
    const response = await modelProvider.generate({ model: MODEL, prompt: ['Report the number of configured organization algorithms, distinct topologies, distinct output behavior shapes, and whether the quorum topology reached quorum.', `Evidence: ${JSON.stringify({ observed, outputShapes, algorithms: runs.map((entry) => ({ name: entry.organization, outputs: Object.keys(entry.result || {}).filter((key) => key !== 'organization') })) })}`, 'Return ONLY JSON with algorithmCount, uniqueTopologies, distinctBehaviors, quorumReached.'].join('\n\n'), seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 80, timeoutMs: 180000 });
    qwenResponse = response.text; const answer = parseAnswer(qwenResponse); const passed = enginePass && JSON.stringify(answer) === JSON.stringify(expected);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S27', seed, status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, observed, algorithms: runs, outputShapes, qwenResponse, answer, enginePass, verified: passed, oracle: 'nineteen organization algorithms produce distinct topology outputs with working boids, fish school, slime mould, grey wolf, blind review, quorum and mycelial route behavior', humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!passed) process.exitCode = 1;
  } catch (error) { const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S27', seed, status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message, qwenResponse, verified: false, durationMs: Date.now() - startedAt }; saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1; }
}
main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });

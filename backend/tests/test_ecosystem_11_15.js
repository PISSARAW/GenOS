'use strict';

const assert = require('assert');
const environment = require('../src/services/environmentModelService');
const niches = require('../src/services/nicheResolverService');
const host = require('../src/services/hostRuntimeIdentityService');
const substrate = require('../src/services/cognitiveSubstrateResolverService');
const physiology = require('../src/services/collectivePhysiologyService');
const flow = require('../src/services/informationFlowResolverService');
const governance = require('../src/services/governancePlaneService');
const interoception = require('../src/services/collectiveInteroceptionService');

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`ok - ${name}`);
}

environment.clearAll();
const env = environment.upsertEnvironment({ identity: 'repo-X', type: 'repository' });
check('environment upsert', env.identity === 'repo-X');

const drift = environment.detectDrift({ previous: { constraints: ['a'] }, current: { constraints: ['b'], volatility: 0.1 } });
check('drift detected', drift.kind === 'ENVIRONMENT_DRIFT');

const built = environment.recordNicheConstruction({ environment: 'repo-X', action: 'architecture-graph' });
check('niche construction', built.affordances.includes('architecture-graph'));

const niche = niches.defineNiche({ id: 'sec', environment: 'repo-X', function: 'detect auth defects', successCriteria: ['patch'] });
check('niche define', niche.environment === 'repo-X');

const ranked = niches.rankCandidates({ niche, candidates: [{ id: 'a' }, { id: 'b' }] });
check('niche rank', ranked.length === 2);

const hostRuntime = host.defineHostRuntime({ host: 'Codex', nativeModel: 'codex-native', nativeAgentRuntime: 'codex' });
check('host identity', hostRuntime.host === 'Codex');

const decision = substrate.resolveSubstrate({ task: {}, host: hostRuntime, availableModels: ['codex-native', 'ollama://qwen'] });
check('native-first', decision.origin === 'native' && decision.requestedModel !== undefined && decision.servedModel === 'codex-native');

const mono = physiology.detectMonoculture({ members: [{ model: 'm', recipe: 'r' }, { model: 'm', recipe: 'r' }, { model: 'm', recipe: 'r' }] });
check('monoculture detected', mono.monoculture === true);

const quorum = physiology.adaptiveQuorum({ votes: [{ choice: 'yes', competence: 0.9, independence: 0.9, calibration: 0.9 }] });
check('quorum weighted', quorum.accepted === true);

const routed = flow.routeKnowledge({ holders: ['A'], needers: ['B'], knowledge: 'finding-1' });
check('targeted routing', routed.broadcast === false && routed.routes.length === 1);

const low = governance.evaluate({ context: governance.defineContext({ principal: 'op', actionRisk: 'LOW' }), action: { risk: 'LOW' } });
check('governance low approve', low.verdict === 'APPROVE');

const critical = governance.evaluate({ context: governance.defineContext({ principal: 'op', actionRisk: 'CRITICAL' }), action: { risk: 'CRITICAL' } });
check('governance critical review', critical.verdict === 'HUMAN_REVIEW');

const gated = governance.gateMorphogenesis({ plan: { spawn: new Array(11).fill('w') }, context: { actionRisk: 'LOW' } });
check('morphogenesis gate', gated.verdict === 'HUMAN_REVIEW');

const health = interoception.healthState({ observabilityDegraded: true });
check('degraded observability', health.epistemicNote === 'unknown / partially observed');

const flailing = interoception.diagnoseFlailing({ topologySwitches: 8, progressDelta: 0, tokenBurn: 0.9 });
check('flailing detected', flailing.flailing === true);

console.log('ecosystem-11-15: all checks passed');

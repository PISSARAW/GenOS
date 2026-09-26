#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { loadFixture, renderFixtureMission } = require('../src/services/comparativeMissionFixtureService');

function main() {
  const fixtureId = process.argv[2];
  if (!fixtureId) throw new Error('Usage: node backend/bin/run-comparative-mission.cjs <level-1..level-6>');
  const fixture = loadFixture(fixtureId);
  const timeoutMs = Number(process.env.GENOS_COMPARATIVE_TIMEOUT_MS) || fixture.reproducibility.maxRuntimeMs;
  const request = {
    strategy: 'metapopulation',
    mode: 'metapopulation',
    background: process.env.GENOS_COMPARATIVE_BACKGROUND === '1',
    mission: renderFixtureMission(fixture),
    timeoutMs,
    execution_budget: { tokens: fixture.reproducibility.maxTokens },
    agent_count: fixture.populations.length
  };
  const orchestrator = path.resolve(__dirname, 'genos-orchestrate.cjs');
  const result = spawnSync(process.execPath, [orchestrator, JSON.stringify(request)], {
    cwd: path.resolve(__dirname, '../..'), stdio: 'inherit',
    timeout: timeoutMs + 30000, windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
}

try { main(); } catch (error) {
  process.stderr.write(`[comparative-mission] ${error.message}\n`);
  process.exitCode = 1;
}

#!/usr/bin/env node
'use strict';

const { chooseDataRoot } = require('../src/storage/storagePlacement');
const { readHostEnvironment, deriveAdaptivePolicy } = require('../src/services/hostEnvironment');

const selection = chooseDataRoot();
const profile = readHostEnvironment({ dataPath: selection.root });
const policy = deriveAdaptivePolicy(profile);
process.stdout.write(`${JSON.stringify({ profile, policy, storage: selection }, null, 2)}\n`);

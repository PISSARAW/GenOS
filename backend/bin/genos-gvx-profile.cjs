'use strict';

const fs = require('node:fs');
const path = require('node:path');
const file = process.argv[2];
if (!file) throw new Error('Usage: node backend/bin/genos-gvx-profile.cjs <profiles.json>');
const absolute = path.resolve(file);
const digest = require('../src/services/gvxVerifierRegistry').digest(fs.readFileSync(absolute));
process.env.GENOS_GVX_EXECUTION_PROFILES_FILE = absolute;
process.env.GENOS_GVX_EXECUTION_PROFILES_SHA256 = digest;
const profiles = require('../src/services/gvxExecutionProfiles');
console.log(JSON.stringify({ file: absolute, sha256: digest,
  profiles: profiles.loadProfiles().map(profiles.publicProfile) }, null, 2));
